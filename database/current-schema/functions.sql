-- ================================================================
-- MRP SYSTEM — DATABASE FUNCTIONS
-- ================================================================


-- ============================================================
-- 1. UPDATE_UPDATED_AT_COLUMN
--    Trigger function: auto-sets updated_at on row modification
--    Used by: products, purchase_orders, soh, parts
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON products
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON purchase_orders
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON soh
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON parts
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 2. CREATE_NEW_PO
--    Creates a purchase order with auto-generated PO number
--    Uses po_counters table for sequence management
-- ============================================================
-- Function signature: create_new_po(...)
-- See Supabase dashboard for full implementation


-- ============================================================
-- 3. UPDATE_PO_DETAILS
--    Safely updates purchase order fields
-- ============================================================
-- Function signature: update_po_details(...)
-- See Supabase dashboard for full implementation


-- ============================================================
-- 4. TOGGLE_PO_STATUS
--    Changes PO status and logs the change to po_status_history
-- ============================================================
-- Function signature: toggle_po_status(po_id UUID, new_status TEXT)
-- See Supabase dashboard for full implementation


-- ============================================================
-- 5. SEARCH_PURCHASE_ORDERS
--    Full-text search across PO number, customer, product
-- ============================================================
-- Function signature: search_purchase_orders(search_term TEXT)
-- See Supabase dashboard for full implementation


-- ============================================================
-- 6. ARCHIVE_FORECASTS_FOR_IMPORT
--    Archives existing forecasts before importing a new batch
--    Sets is_active = false and archived_at = now()
-- ============================================================
-- Function signature: archive_forecasts_for_import(...)
-- See Supabase dashboard for full implementation