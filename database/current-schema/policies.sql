-- ================================================================
-- MRP SYSTEM — ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================================
--
-- CURRENT STATE: All policies are "Allow All" (open access)
--
-- ⚠️  TODO: Before production, implement proper role-based policies:
--     - anon:          Read-only on products, forecasts
--     - authenticated: Full CRUD on all tables
--     - service_role:  Bypass RLS (used by backend API)
--
-- ================================================================


-- Enable RLS on all tables
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_components    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_counters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE soh               ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts         ENABLE ROW LEVEL SECURITY;

-- ⚠️  Tables WITHOUT RLS (should be added):
-- ALTER TABLE parts          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE kpi_snapshots  ENABLE ROW LEVEL SECURITY;


-- Current "Allow All" Policies
CREATE POLICY "Allow all on products"          ON products          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bom_components"    ON bom_components    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on purchase_orders"   ON purchase_orders   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on po_status_history" ON po_status_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on po_counters"       ON po_counters       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on soh"               ON soh               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on forecasts"         ON forecasts         FOR ALL USING (true) WITH CHECK (true);