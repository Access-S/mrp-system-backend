-- ============================================
-- COMPLETE MRP DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- BLOCK 1: Products Table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code TEXT NOT NULL UNIQUE,
    description TEXT,
    units_per_shipper INT,
    daily_run_rate NUMERIC,
    hourly_run_rate NUMERIC,
    mins_per_shipper NUMERIC,
    price_per_shipper NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BLOCK 2: BOM Components Table
CREATE TABLE bom_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    part_code TEXT NOT NULL,
    part_description TEXT,
    part_type TEXT,
    per_shipper NUMERIC
);

-- BLOCK 3: Purchase Orders Table
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number TEXT NOT NULL UNIQUE,
    sequence INT NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    po_created_date DATE,
    po_received_date DATE,
    requested_delivery_date DATE,
    ordered_qty_pieces INT NOT NULL,
    ordered_qty_shippers NUMERIC NOT NULL,
    customer_amount NUMERIC NOT NULL,
    system_amount NUMERIC NOT NULL,
    current_status TEXT NOT NULL DEFAULT 'Open',
    delivery_date DATE,
    delivery_docket_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    description TEXT,
    hourly_run_rate NUMERIC,
    mins_per_shipper NUMERIC
);

-- BLOCK 4: PO Status History Table
CREATE TABLE po_status_history (
    id BIGSERIAL PRIMARY KEY,
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BLOCK 5: PO Counters Table
CREATE TABLE po_counters (
    customer_name TEXT PRIMARY KEY,
    last_sequence INT NOT NULL DEFAULT 0
);

-- BLOCK 6: SOH Table (Stock on Hand)
CREATE TABLE soh (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT,
    description TEXT,
    stock_on_hand NUMERIC DEFAULT 0,
    default_uom TEXT,
    locations TEXT,
    ean TEXT,
    weight_kg NUMERIC DEFAULT 0,
    volume_m3 NUMERIC DEFAULT 0,
    import_batch_id UUID DEFAULT gen_random_uuid(),
    import_source TEXT DEFAULT 'manual_upload',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BLOCK 7: Forecasts Table
CREATE TABLE forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code TEXT NOT NULL,
    description TEXT,
    forecast_date DATE NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_products_code ON products(product_code);
CREATE INDEX idx_bom_product_id ON bom_components(product_id);
CREATE INDEX idx_po_status ON purchase_orders(current_status);
CREATE INDEX idx_po_customer ON purchase_orders(customer_name);
CREATE INDEX idx_po_sequence ON purchase_orders(sequence);
CREATE INDEX idx_po_history_po_id ON po_status_history(po_id);
CREATE INDEX idx_soh_product_id ON soh(product_id);
CREATE INDEX idx_soh_created_at ON soh(created_at);
CREATE INDEX idx_soh_import_batch_id ON soh(import_batch_id);
CREATE INDEX idx_forecasts_product ON forecasts(product_code);
CREATE INDEX idx_forecasts_date ON forecasts(forecast_date);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_soh_updated_at
    BEFORE UPDATE ON soh
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE soh ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust for your auth needs)
CREATE POLICY "Allow all on products" ON products FOR ALL USING (true);
CREATE POLICY "Allow all on bom_components" ON bom_components FOR ALL USING (true);
CREATE POLICY "Allow all on purchase_orders" ON purchase_orders FOR ALL USING (true);
CREATE POLICY "Allow all on po_status_history" ON po_status_history FOR ALL USING (true);
CREATE POLICY "Allow all on po_counters" ON po_counters FOR ALL USING (true);
CREATE POLICY "Allow all on soh" ON soh FOR ALL USING (true);
CREATE POLICY "Allow all on forecasts" ON forecasts FOR ALL USING (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- FUNCTION 1: Search Purchase Orders
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

-- FUNCTION 2: Toggle PO Status
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

-- FUNCTION 3: Create New PO
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

-- FUNCTION 4: Update PO Details
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