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
    created_at TIMESTAMTz NOT NULL DEFAULT now()
);

-- BLOCK 5: PO Counters Table
CREATE TABLE po_counters (
    customer_name TEXT PRIMARY KEY,
    last_sequence INT NOT NULL DEFAULT 0
);