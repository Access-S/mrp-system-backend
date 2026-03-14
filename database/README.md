# 🗄️ MRP System — Database Documentation

## Overview

The MRP System uses **Supabase (PostgreSQL)** as its database layer. This document
tells the full story of the database — what tables exist, how they relate,
what functions power the business logic, and how the schema evolved over time.

---

## 📊 Database at a Glance

| Metric               | Count |
|----------------------|-------|
| Tables                | 9     |
| Functions             | 6     |
| Foreign Keys          | 4     |
| RLS Policies          | 7     |

---

## 📋 Tables Overview

| Table               | Purpose                                    | Row-Level Security |
|---------------------|--------------------------------------------|--------------------|
| `products`          | Core product catalog                       | ✅ Allow All        |
| `bom_components`    | Bill of Materials — parts per product      | ✅ Allow All        |
| `purchase_orders`   | Customer purchase orders                   | ✅ Allow All        |
| `po_status_history` | Tracks PO status changes over time         | ✅ Allow All        |
| `po_counters`       | Auto-incrementing PO number sequences      | ✅ Allow All        |
| `forecasts`         | Demand forecasts per product per date      | ✅ Allow All        |
| `soh`               | Stock On Hand — imported inventory data    | ✅ Allow All        |
| `parts`             | Parts catalog with cost & supplier info    | ❌ None             |
| `kpi_snapshots`     | Dashboard KPI snapshots for trends         | ❌ None             |

---

## 🔗 Relationships
products (central table)
│
├── 1:N → bom_components (product_id → products.id)
├── 1:N → purchase_orders (product_id → products.id)
├── 1:N → forecasts (product_code → products.product_code)
│
purchase_orders
│
└── 1:N → po_status_history (po_id → purchase_orders.id)


**Standalone Tables (no foreign keys):**
- `po_counters` — Utility table for PO number generation
- `soh` — Imported stock data (linked by part_code text, no FK)
- `parts` — Parts catalog (supplier_id exists but no FK constraint)
- `kpi_snapshots` — Dashboard analytics snapshots

---

## ⚡ Functions

| Function                         | Purpose                                              |
|----------------------------------|------------------------------------------------------|
| `create_new_po`                  | Creates a PO with auto-generated PO number           |
| `update_po_details`              | Updates PO fields safely                             |
| `toggle_po_status`               | Changes PO status and logs to po_status_history      |
| `search_purchase_orders`         | Full-text search across PO fields                    |
| `archive_forecasts_for_import`   | Archives old forecasts before importing new batch    |
| `update_updated_at_column`       | Trigger function to auto-set updated_at timestamp    |

---

## 📁 Folder Structure
database/
├── README.md ← You are here
├── current-schema/
│ ├── tables.sql → All current table definitions
│ ├── functions.sql → All database functions
│ └── policies.sql → Row-Level Security policies
├── migrations/
│ └── 001_create_soh_table.sql → Historical migration files
├── diagrams/
│ └── er-diagram.md → Entity Relationship diagram
└── changelog/
└── CHANGELOG.md → Schema change history


---

## 🔐 Security Notes

- **RLS is enabled** on 7 of 9 tables
- Current policies are **"Allow All"** (open access)
- `parts` and `kpi_snapshots` have **no RLS policies**
- **⚠️ TODO:** Implement proper role-based policies before production

---

## 📎 Related Documentation

- [ER Diagram](diagrams/er-diagram.md)
- [Schema Changelog](changelog/CHANGELOG.md)
- [Current Schema SQL](current-schema/)