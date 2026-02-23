-- KPI Snapshots Table
CREATE TABLE kpi_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_type TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    period_label TEXT NOT NULL,
    open_orders INT NOT NULL DEFAULT 0,
    open_order_value NUMERIC NOT NULL DEFAULT 0,
    work_hours_pending NUMERIC NOT NULL DEFAULT 0,
    attention_required INT NOT NULL DEFAULT 0,
    components_at_risk INT NOT NULL DEFAULT 0,
    avg_turnaround_days NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(snapshot_type, snapshot_date)
);

-- Index for fast lookups
CREATE INDEX idx_kpi_snapshots_type_date 
ON kpi_snapshots(snapshot_type, snapshot_date DESC);

-- Index for range queries
CREATE INDEX idx_kpi_snapshots_date_range
ON kpi_snapshots(snapshot_date, snapshot_type);