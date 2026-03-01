# Backend Architecture Blueprint: MRP System

This blueprint defines the structural and strategic architectural decisions for the MRP (Material Requirements Planning) system backend, designed to support scalability, data integrity, and potential transition to a multi-tenant SaaS model.

---

## 1. API Layer Design
The API layer acts as the primary interface between the frontend and the database, prioritizing predictable routing, strong validation, and decoupled concerns.

*   **Architecture Pattern**: RESTful architecture utilizing an Express.js controller-route pattern.
*   **Routing Structure**: Domain-driven route isolation (e.g., `/api/v1/purchase-orders`, `/api/v1/soh`, `/api/v1/dashboard`).
*   **Validation**: Middleware using a robust schema validation library (e.g., `Joi` or `Zod`) on all incoming request bodies and query parameters before they hit controllers.
*   **Error Handling**: Global centralized error handling middleware capturing predefined application errors (e.g., `createError(msg, code)`) to ensure consistent JSON failure responses (e.g., `{ success: false, message: "..." }`).
*   **Pagination & Filtering**: Standardized via URL query parameters (`?page=1&limit=25&search=abc&status=Open`).

## 2. Authentication & Authorization Strategy (Future)
To secure the application and allow role-based actions, we will integrate Supabase Auth.

*   **Authentication Flow**:
    *   Frontend logs in via Supabase Auth and receives a JWT.
    *   The Express backend protects routes using middleware that verifies the Supabase JWT.
    *   Alternatively, frontend makes direct calls to Supabase PostgREST endpoints where appropriate, passing the JWT automatically.
*   **Authorization (RBAC)**:
    *   Define user roles (e.g., `Admin`, `Planner`, `Sales`, `Read-Only`) within user metadata or a dedicated `user_roles` table.
    *   Middleware on the Express server inspects claims/roles to authorize specific route paths (e.g., deleting a PO requires `Admin`).

## 3. Data Ownership Model
A clear model of how data is related and cascaded upon deletions to prevent orphaned records.

*   **Master Data**: `Products` and `BOM Components`. These are the source of truth. Deleting a product must logically cascade or be restricted if linked to active executions.
    *   *Implementation*: `ON DELETE RESTRICT` for products tied to open POs, or `ON DELETE CASCADE` for BOM components tied to a product.
*   **Transactional Data**: `Purchase Orders` and `Forecasts`. Owned by the system state but heavily dependent on Master Data.
*   **Audit/History Data**: `PO Status History` and `KPI Snapshots`. These are append-only ledgers. They should never be hard-deleted to preserve historical integrity.

## 4. Transaction & Concurrency Handling Strategy
As the system scales, multiple users or integrations may attempt to modify inventory or orders simultaneously.

*   **Concurrency Control**:
    *   Use **Optimistic Concurrency Control (OCC)** for updating specific entities like an individual PO (e.g., tracking a `version` or `updated_at` timestamp). If the timestamp differs from the client's payload, reject the update.
    *   For sequence generation (like `po_counters`), rely on atomic database operations (e.g., `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`).
*   **Database Transactions**:
    *   Complex operations (e.g., toggling a PO status that simultaneously triggers an SOH inventory deduction) MUST be wrapped in PostgreSQL Transactions (via Supabase RPCs/Stored Procedures) rather than executing multiple sequential sequential API calls from the Node.js layer to avoid race conditions and partial states.

## 5. MRP Computation Migration Plan
Currently, "Components at Risk" relies on a static `< 100` Stock-on-Hand rule. We need a dynamic calculation engine.

*   **Current State**: Static check on `soh.stock_on_hand < 100`.
*   **Future State (Dynamic MRP Engine)**:
    1.  **Demand Calculation**: Aggregate all `ordered_qty_pieces` from open POs grouped by `product_id`.
    2.  **Explosion Module**: Join products to their `bom_components` to calculate the gross requirement of individual part numbers.
    3.  **Netting Module**: Subtract the gross requirement from current `soh`. If the resulting number is negative, the component is *actually* at risk.
*   **Migration**:
    *   Build this logic as a secure Supabase RPC function (e.g., `calculate_dynamic_mrp()`).
    *   Run this asynchronously or cache it if the calculation becomes too heavy for real-time dashboard loads.

## 6. Dashboard Aggregation Strategy
Dashboards require fast reads on heavy aggregations.

*   **Caching & Materialized Views**: If live aggregation of thousands of POs slows down, use PostgreSQL Materialized Views for live metrics that refresh periodically (e.g., every 5 minutes).
*   **Continuous Snapshots**: Retain the existing `kpi_snapshots` CRON job strategy to permanently freeze weekly/monthly state.
*   **Database-level Aggregation**: Aggregation math (SUM, AVG) should happen within the Postgres layer using RPCs or Views, rather than fetching thousands of rows to the Node.js server and calculating in JavaScript.

## 7. Security & RLS Planning
Protecting the database from unauthorized direct access or horizontal permission escalation.

*   **Row Level Security (RLS)**:
    *   Currently, policies are set to `FOR ALL USING (true)`.
    *   **Action**: Change this to validate the authenticated user. For internal apps, this means `USING (auth.role() = 'authenticated')`.
*   **Environment Variables**: Strict separation of Supabase `anon_key` (for frontend/read-only) vs `service_role_key` (for backend admin tasks).
*   **Input Sanitization**: Ensure all external files (Excel uploads) and JSON payloads are strictly validated to prevent SQL injection or malicious payload execution.

## 8. Environment Configuration Standardization
Ensuring reliable deployments across stages (Dev, Staging, Prod).

*   **Config Structure**: Utilize `.env` files parsed by a central configuration module (e.g., `src/config/env.ts`) that asserts all required variables exist at startup (fail-fast).
*   **Variables**:
    *   `PORT`
    *   `SUPABASE_URL`
    *   `SUPABASE_SERVICE_KEY`
    *   `CRON_SECRET`
    *   `NODE_ENV`
*   **CI/CD Pipeline**: Deployments (e.g., to Render/Vercel) should enforce zero-downtime builds triggered by merged Pull Requests and automated database migrations using a tool like Flyway or Supabase CLI.

## 9. Multi-Tenant Readiness (Future SaaS Possibility)
To transition from a single internal tool to a multi-tenant SaaS platform.

*   **Tenant Isolation**:
    *   **Option A (Row-Level Security / Pooled)**: Add a `tenant_id` UUID column to EVERY table. Enforce tenant isolation purely through Supabase RLS (`USING (tenant_id = auth.jwt() ->> 'tenant_id')`). This is easier to maintain.
    *   **Option B (Schema-Level)**: Create a new PostgreSQL schema per tenant. Harder to migrate, but offers stronger isolation.
*   **Recommendation**: Proceed with **Option A (RLS)** as it fits naturally with Supabase's ecosystem.
*   **Preparation**: Even before multi-tenancy, introduce a dummy `tenant_id` standard now, or ensure the architecture is clean enough that adding a `tenant_id` column to all tables and rewriting RPCs won't require a complete rewrite.
