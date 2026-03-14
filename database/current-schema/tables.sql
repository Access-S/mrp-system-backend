-- ================================================================
-- MRP SYSTEM — CURRENT TABLE DEFINITIONS
-- Generated from Supabase schema
-- ================================================================


-- ============================================================
-- 1. PRODUCTS — Core product catalog
-- ============================================================
CREATE TABLE products (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code      TEXT NOT NULL UNIQUE,
    description       TEXT,
    units_per_shipper INTEGER,
    daily_run_rate    NUMERIC,
    hourly_run_rate   NUMERIC,
    mins_per_shipper  NUMERIC,
    price_per_shipper NUMERIC,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 2. BOM_COMPONENTS — Bill of Materials per product
-- ============================================================
CREATE TABLE bom_components (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID NOT NULL REFERENCES products(id),
    part_code        TEXT NOT NULL,
    part_description TEXT,
    part_type        TEXT,
    per_shipper      NUMERIC
);


-- ============================================================
-- 3. PURCHASE_ORDERS — Customer purchase orders
-- ============================================================
CREATE TABLE purchase_orders (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number                TEXT NOT NULL UNIQUE,
    sequence                 INTEGER NOT NULL,
    product_id               UUID REFERENCES products(id),
    customer_name            TEXT NOT NULL,
    description              TEXT,
    po_created_date          DATE,
    po_received_date         DATE,
    requested_delivery_date  DATE,
    ordered_qty_pieces       INTEGER NOT NULL,
    ordered_qty_shippers     NUMERIC NOT NULL,
    customer_amount          NUMERIC NOT NULL,
    system_amount            NUMERIC NOT NULL,
    current_status           TEXT NOT NULL DEFAULT 'Open',
    delivery_date            DATE,
    delivery_docket_number   TEXT,
    hourly_run_rate          NUMERIC,
    mins_per_shipper         NUMERIC,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 4. PO_STATUS_HISTORY — Tracks PO status changes
-- ============================================================
CREATE TABLE po_status_history (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_id      UUID NOT NULL REFERENCES purchase_orders(id),
    status     TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 5. PO_COUNTERS — Auto-increment PO number sequences
-- ============================================================
CREATE TABLE po_counters (
    customer_name  TEXT PRIMARY KEY,
    last_sequence  INTEGER NOT NULL DEFAULT 0
);


-- ============================================================
-- 6. FORECASTS — Demand forecasts per product per date
-- ============================================================
CREATE TABLE forecasts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code    TEXT NOT NULL REFERENCES products(product_code),
    description     TEXT,
    forecast_date   DATE NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    import_batch_id UUID DEFAULT gen_random_uuid(),
    is_active       BOOLEAN DEFAULT true,
    archived_at     TIMESTAMPTZ
);


-- ============================================================
-- 7. SOH — Stock On Hand (imported inventory data)
-- ============================================================
CREATE TABLE soh (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_code       TEXT,
    description     TEXT,
    stock_on_hand   NUMERIC DEFAULT 0,
    default_uom     TEXT,
    locations       TEXT,
    ean             TEXT,
    weight_kg       NUMERIC DEFAULT 0,
    volume_m3       NUMERIC DEFAULT 0,
    import_batch_id UUID DEFAULT gen_random_uuid(),
    import_source   TEXT DEFAULT 'manual_upload',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active       BOOLEAN DEFAULT true,
    archived_at     TIMESTAMPTZ
);


-- ============================================================
-- 8. PARTS — Parts catalog with cost & supplier info
-- ============================================================
CREATE TABLE parts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_code      TEXT NOT NULL UNIQUE,
    unit_cost      NUMERIC NOT NULL DEFAULT 0.00,
    supplier_id    UUID,
    lead_time_days INTEGER,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 9. KPI_SNAPSHOTS — Dashboard KPI trend data
-- ============================================================
CREATE TABLE kpi_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_type       TEXT NOT NULL,
    snapshot_date       DATE NOT NULL,
    period_label        TEXT NOT NULL,
    open_orders         INTEGER NOT NULL DEFAULT 0,
    open_order_value    NUMERIC NOT NULL DEFAULT 0,
    work_hours_pending  NUMERIC NOT NULL DEFAULT 0,
    attention_required  INTEGER NOT NULL DEFAULT 0,
    components_at_risk  INTEGER NOT NULL DEFAULT 0,
    avg_turnaround_days NUMERIC NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);