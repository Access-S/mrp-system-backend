# 🔗 Entity Relationship Diagram

## Visual Overview
┌─────────────────────┐
│ products │
│─────────────────────│
│ PK id │
│ product_code ◄─┼──────────────────────────────────────┐
│ description │ │
│ units_per_ship │ │
│ daily_run_rate │ │
│ hourly_run_rate │ │
│ mins_per_ship │ │
│ price_per_ship │ │
│ created_at │ │
│ updated_at │ │
└──────┬──────┬───────┘ │
│ │ │
│ │ 1:N │ 1:N
│ │ │
│ ▼ │
│ ┌─────────────────────┐ ┌────────────┴────────────┐
│ │ bom_components │ │ forecasts │
│ │─────────────────────│ │─────────────────────────│
│ │ PK id │ │ PK id │
│ │ FK product_id ─────┤ │ FK product_code ───────┤
│ │ part_code │ │ description │
│ │ part_description│ │ forecast_date │
│ │ part_type │ │ quantity │
│ │ per_shipper │ │ import_batch_id │
│ └─────────────────────┘ │ is_active │
│ │ archived_at │
│ 1:N │ created_at │
│ └─────────────────────────┘
▼
┌─────────────────────────┐ ┌─────────────────────────┐
│ purchase_orders │ │ po_counters │
│─────────────────────────│ │─────────────────────────│
│ PK id │ │ PK customer_name │
│ po_number │ │ last_sequence │
│ sequence │ └─────────────────────────┘
│ FK product_id ─────────┤
│ customer_name │
│ description │
│ po_created_date │
│ po_received_date │
│ requested_del_date │
│ ordered_qty_pieces │
│ ordered_qty_shippers│
│ customer_amount │
│ system_amount │
│ current_status │
│ delivery_date │
│ delivery_docket_no │
│ hourly_run_rate │
│ mins_per_shipper │
│ created_at │
│ updated_at │
└──────────┬──────────────┘
│
│ 1:N
▼
┌─────────────────────────┐
│ po_status_history │
│─────────────────────────│
│ PK id │
│ FK po_id ──────────────┤
│ status │
│ created_at │
└─────────────────────────┘

=== STANDALONE TABLES (No Foreign Keys) ===

┌─────────────────────────┐ ┌─────────────────────────┐
│ soh │ │ parts │
│─────────────────────────│ │─────────────────────────│
│ PK id │ │ PK id │
│ part_code │ │ part_code │
│ description │ │ unit_cost │
│ stock_on_hand │ │ supplier_id (no FK) │
│ default_uom │ │ lead_time_days │
│ locations │ │ created_at │
│ ean │ │ updated_at │
│ weight_kg │ └─────────────────────────┘
│ volume_m3 │
│ import_batch_id │ ┌─────────────────────────┐
│ import_source │ │ kpi_snapshots │
│ is_active │ │─────────────────────────│
│ archived_at │ │ PK id │
│ created_at │ │ snapshot_type │
│ updated_at │ │ snapshot_date │
└─────────────────────────┘ │ period_label │
│ open_orders │
│ open_order_value │
│ work_hours_pending │
│ attention_required │
│ components_at_risk │
│ avg_turnaround_days │
│ created_at │
└─────────────────────────┘


## Relationship Summary

| Parent Table      | Child Table         | FK Column      | Relationship | On Delete |
|-------------------|---------------------|----------------|-------------|-----------|
| products          | bom_components      | product_id     | 1:N         | Default   |
| products          | purchase_orders     | product_id     | 1:N         | Default   |
| products          | forecasts           | product_code   | 1:N         | Default   |
| purchase_orders   | po_status_history   | po_id          | 1:N         | Default   |

## Potential Missing Relationships

| Table    | Column      | Could Link To    | Notes                          |
|----------|-------------|------------------|--------------------------------|
| parts    | supplier_id | suppliers (TBD)  | No suppliers table exists yet  |
| soh      | part_code   | parts.part_code  | Logical link, no FK constraint |