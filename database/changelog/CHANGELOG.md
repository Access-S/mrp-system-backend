# 📝 Database Schema Changelog

All notable changes to the database schema are documented here.

---

## [Current] — 2026-03-14

### Tables (9 total)
- `products` — Core product catalog
- `bom_components` — Bill of Materials
- `purchase_orders` — Customer POs
- `po_status_history` — PO status tracking
- `po_counters` — PO number auto-generation
- `forecasts` — Demand forecasts with archival support
- `soh` — Stock On Hand with import tracking
- `parts` — Parts catalog with cost info
- `kpi_snapshots` — Dashboard KPI trend data

### Functions (6 total)
- `create_new_po` — Auto-generates PO numbers
- `update_po_details` — Safe PO field updates
- `toggle_po_status` — Status changes with history logging
- `search_purchase_orders` — Full-text PO search
- `archive_forecasts_for_import` — Archival before re-import
- `update_updated_at_column` — Auto-timestamp trigger

---

## Schema Evolution Notes

> Add entries below as changes are made. Use the format:
>
> ## [Version/Date] — YYYY-MM-DD
> ### Added
> - New table/column/function
> ### Changed
> - Modified column type, renamed field
> ### Removed
> - Dropped table/column
> ### Fixed
> - Constraint corrections, data fixes

---

## [Initial] — Project Start

### Added
- Created `products` table
- Created `bom_components` table with FK to products
- Created `purchase_orders` table with FK to products
- Created `po_status_history` table with FK to purchase_orders
- Created `po_counters` table for PO number sequences
- Created `forecasts` table with FK to products (via product_code)
- Created `soh` table for Stock On Hand imports
- Created `parts` table for component cost tracking
- Created `kpi_snapshots` table for dashboard analytics
- Added RLS policies (Allow All) on 7 tables
- Created 6 database functions for business logic