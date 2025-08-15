-- BLOCK 1: search_purchase_orders function
DROP FUNCTION IF EXISTS search_purchase_orders(TEXT, TEXT);
CREATE OR REPLACE FUNCTION search_purchase_orders(
    search_term TEXT,
    status_filter TEXT
)
RETURNS TABLE (
    id uuid, po_number text, sequence integer, product_id uuid, customer_name text,
    po_created_date date, po_received_date date, requested_delivery_date date,
    ordered_qty_pieces integer, ordered_qty_shippers numeric, customer_amount numeric,
    system_amount numeric, current_status text, delivery_date date,
    delivery_docket_number text, created_at timestamptz, updated_at timestamptz,
    description text, hourly_run_rate numeric, mins_per_shipper numeric,
    product JSON,
    statuses JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        po.*,
        (SELECT row_to_json(p.*) FROM products p WHERE p.id = po.product_id) AS product,
        (
            SELECT json_agg(json_build_object('status', psh.status))
            FROM po_status_history psh
            WHERE psh.po_id = po.id
        ) AS statuses
    FROM purchase_orders po
    WHERE
        (status_filter = '' OR po.current_status = status_filter) AND
        (search_term = '' OR (
            po.po_number ILIKE '%' || search_term || '%' OR
            EXISTS (
                SELECT 1 FROM products p
                WHERE p.id = po.product_id
                AND (
                    p.product_code ILIKE '%' || search_term || '%' OR
                    p.description ILIKE '%' || search_term || '%'
                )
            )
        ));
END;
$$ LANGUAGE plpgsql;

-- BLOCK 2: toggle_po_status function
DROP FUNCTION IF EXISTS toggle_po_status(UUID, TEXT);
CREATE OR REPLACE FUNCTION toggle_po_status(target_po_id UUID, status_to_toggle TEXT)
RETURNS TABLE(statuses TEXT[]) AS $$
DECLARE
    new_current_status TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM po_status_history WHERE po_id = target_po_id AND status = status_to_toggle) THEN
        DELETE FROM po_status_history WHERE po_id = target_po_id AND status = status_to_toggle;
    ELSE
        INSERT INTO po_status_history (po_id, status) VALUES (target_po_id, status_to_toggle);
    END IF;

    SELECT status INTO new_current_status
    FROM po_status_history WHERE po_id = target_po_id ORDER BY created_at DESC LIMIT 1;

    IF new_current_status IS NULL THEN
        new_current_status := 'Open';
        INSERT INTO po_status_history (po_id, status) VALUES (target_po_id, 'Open');
    END IF;
    
    UPDATE purchase_orders SET current_status = new_current_status WHERE id = target_po_id;

    RETURN QUERY SELECT array_agg(status) FROM po_status_history WHERE po_id = target_po_id;
END;
$$ LANGUAGE plpgsql;

-- BLOCK 3: create_new_po function
DROP FUNCTION IF EXISTS create_new_po(TEXT, TEXT, TEXT, DATE, DATE, INT, NUMERIC);
CREATE OR REPLACE FUNCTION create_new_po(
    p_po_number TEXT, p_product_code TEXT, p_customer_name TEXT, p_po_created_date DATE,
    p_po_received_date DATE, p_ordered_qty_pieces INT, p_customer_amount NUMERIC
)
RETURNS TABLE(created_po_id UUID) AS $$
DECLARE
    v_product RECORD; v_new_sequence INT; v_calculated_shippers NUMERIC;
    v_system_amount NUMERIC; v_amount_difference NUMERIC; v_initial_status TEXT;
    v_new_po_id UUID;
BEGIN
    SELECT * INTO v_product FROM products WHERE product_code = p_product_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product with code % not found.', p_product_code; END IF;

    IF EXISTS (SELECT 1 FROM purchase_orders WHERE po_number = p_po_number) THEN
        RAISE EXCEPTION 'Purchase order number % already exists.', p_po_number; END IF;

    IF v_product.units_per_shipper IS NULL OR v_product.units_per_shipper = 0 THEN
        RAISE EXCEPTION 'Product % is missing units_per_shipper.', p_product_code; END IF;
    v_calculated_shippers := p_ordered_qty_pieces / v_product.units_per_shipper::NUMERIC;
    v_system_amount := v_calculated_shippers * (v_product.price_per_shipper);
    v_amount_difference := abs(p_customer_amount - v_system_amount);

    IF v_amount_difference > 5 THEN v_initial_status := 'PO Check'; ELSE v_initial_status := 'Open'; END IF;

    INSERT INTO po_counters (customer_name, last_sequence) VALUES (p_customer_name, 1)
    ON CONFLICT (customer_name) DO UPDATE SET last_sequence = po_counters.last_sequence + 1
    RETURNING last_sequence INTO v_new_sequence;

    INSERT INTO purchase_orders (
        po_number, product_id, customer_name, po_created_date, po_received_date,
        ordered_qty_pieces, customer_amount, ordered_qty_shippers, system_amount,
        sequence, current_status, description, hourly_run_rate, mins_per_shipper
    ) VALUES (
        p_po_number, v_product.id, p_customer_name, p_po_created_date, p_po_received_date,
        p_ordered_qty_pieces, p_customer_amount, v_calculated_shippers, v_system_amount,
        v_new_sequence, v_initial_status, v_product.description, v_product.hourly_run_rate, v_product.mins_per_shipper
    ) RETURNING id INTO v_new_po_id;

    INSERT INTO po_status_history (po_id, status) VALUES (v_new_po_id, v_initial_status);
    
    RETURN QUERY SELECT v_new_po_id;
END;
$$ LANGUAGE plpgsql;

-- BLOCK 4: update_po_details function
DROP FUNCTION IF EXISTS update_po_details(UUID, TEXT, TEXT, DATE, DATE, INT, NUMERIC);
CREATE OR REPLACE FUNCTION update_po_details(
    p_po_id UUID,
    p_po_number TEXT,
    p_customer_name TEXT,
    p_po_created_date DATE,
    p_po_received_date DATE,
    p_ordered_qty_pieces INT,
    p_customer_amount NUMERIC
)
RETURNS TABLE(updated_po_id UUID) AS $$
DECLARE
    v_po RECORD;
    v_product RECORD;
    v_recalculated_shippers NUMERIC;
    v_recalculated_system_amount NUMERIC;
    v_amount_difference NUMERIC;
    v_new_status TEXT;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order with ID % not found.', p_po_id; END IF;

    SELECT * INTO v_product FROM products WHERE id = v_po.product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Related product not found for PO %.', v_po.po_number; END IF;

    IF v_product.units_per_shipper IS NULL OR v_product.units_per_shipper = 0 THEN
        RAISE EXCEPTION 'Product % is missing units_per_shipper.', v_product.product_code; END IF;
    v_recalculated_shippers := p_ordered_qty_pieces / v_product.units_per_shipper::NUMERIC;
    v_recalculated_system_amount := v_recalculated_shippers * v_product.price_per_shipper;
    v_amount_difference := abs(p_customer_amount - v_recalculated_system_amount);

    IF v_amount_difference > 5 THEN v_new_status := 'PO Check'; ELSE v_new_status := 'Open'; END IF;
    
    UPDATE purchase_orders
    SET
        po_number = p_po_number,
        customer_name = p_customer_name,
        po_created_date = p_po_created_date,
        po_received_date = p_po_received_date,
        ordered_qty_pieces = p_ordered_qty_pieces,
        customer_amount = p_customer_amount,
        ordered_qty_shippers = v_recalculated_shippers,
        system_amount = v_recalculated_system_amount,
        current_status = v_new_status,
        updated_at = now()
    WHERE id = p_po_id;

    DELETE FROM po_status_history
    WHERE po_id = p_po_id AND status IN ('Open', 'PO Check');
    
    INSERT INTO po_status_history (po_id, status)
    VALUES (p_po_id, v_new_status);

    RETURN QUERY SELECT p_po_id;
END;
$$ LANGUAGE plpgsql;