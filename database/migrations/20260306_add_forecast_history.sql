-- database/migrations/20260306_add_forecast_history.sql

-- ============== BLOCK 1: Migration Header & Purpose ==============
-- Migration: Add forecast history tracking support
-- Purpose: Enable append-only imports with batch tracking and soft-archiving
-- Date: 2026-03-06
-- Branch: redesign/forecast-page
-- 
-- Changes:
-- 1. Add import_batch_id for grouping records by import session
-- 2. Add is_active flag for soft-archiving (default: true)
-- 3. Add archived_at timestamp for audit trail
-- 4. Add composite index for efficient active-record queries
-- 5. Add optional foreign key to products table (with graceful fallback)
--
-- Safety: This migration is idempotent (safe to run multiple times)

-- ============== BLOCK 2: Add History Tracking Columns ==============

-- Add import_batch_id for grouping records by import session
ALTER TABLE public.forecasts 
ADD COLUMN IF NOT EXISTS import_batch_id UUID DEFAULT gen_random_uuid();

-- Add is_active flag for soft-archiving (new imports archive old records)
ALTER TABLE public.forecasts 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add archived_at timestamp for audit trail (NULL = never archived)
ALTER TABLE public.forecasts 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ============== BLOCK 3: Add Performance Indexes ==============

-- Composite index for fast queries of active forecasts by product + date
CREATE INDEX IF NOT EXISTS idx_forecasts_active_product_date 
ON public.forecasts USING btree (product_code, forecast_date) 
WHERE is_active = true;

-- Index for querying by import batch (audit/history views)
CREATE INDEX IF NOT EXISTS idx_forecasts_import_batch 
ON public.forecasts USING btree (import_batch_id);

-- Index for querying archived records (audit/compliance)
CREATE INDEX IF NOT EXISTS idx_forecasts_archived 
ON public.forecasts USING btree (archived_at) 
WHERE is_active = false;

-- ============== BLOCK 4: Add Foreign Key Constraint (Optional but Recommended) ==============

-- Add FK to products table with graceful fallback if product is deleted
-- This ensures data integrity while allowing imports even if product doesn't exist yet
-- Note: We use ON DELETE SET NULL to avoid breaking existing forecasts if product is removed
DO $$ 
BEGIN
  -- Check if constraint already exists to make migration idempotent
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'forecasts_product_code_fkey' 
    AND table_name = 'forecasts'
  ) THEN
    ALTER TABLE public.forecasts
    ADD CONSTRAINT forecasts_product_code_fkey 
    FOREIGN KEY (product_code) 
    REFERENCES public.products(product_code) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- ============== BLOCK 5: Helper Function for Archiving Old Forecasts ==============

-- Optional utility function: Archive previous active forecasts for a product+date before inserting new ones
-- Usage: SELECT archive_forecasts_for_import('PRODUCT123', '2026-03-01', 'new-batch-uuid');
CREATE OR REPLACE FUNCTION public.archive_forecasts_for_import(
  p_product_code TEXT,
  p_forecast_date DATE,
  p_new_batch_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with elevated privileges to ensure archiving works under RLS
AS $$
BEGIN
  -- Soft-archive any existing active forecasts for this product+date combination
  UPDATE public.forecasts
  SET 
    is_active = false,
    archived_at = NOW()
  WHERE 
    product_code = p_product_code
    AND forecast_date = p_forecast_date
    AND is_active = true
    AND import_batch_id IS DISTINCT FROM p_new_batch_id; -- Don't archive records from same batch
END;
$$;

-- ============== BLOCK 6: Migration Metadata & Rollback Instructions ==============

-- Record this migration in supabase_migrations table (if using Supabase CLI)
-- Note: Commented out by default to avoid errors if supabase_migrations table doesn't exist
-- Uncomment below only if your project uses the Supabase CLI migrations table
/*
INSERT INTO supabase_migrations (name, hash) 
VALUES ('20260306_add_forecast_history', md5(pg_read_file('database/migrations/20260306_add_forecast_history.sql')))
ON CONFLICT (name) DO NOTHING;
*/

-- ROLLBACK INSTRUCTIONS (for emergency use only):
-- WARNING: Rolling back will remove history tracking columns. Only do this if no imports have used them yet.
/*
ALTER TABLE public.forecasts 
  DROP COLUMN IF EXISTS import_batch_id,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS archived_at;

DROP INDEX IF EXISTS idx_forecasts_active_product_date;
DROP INDEX IF EXISTS idx_forecasts_import_batch;
DROP INDEX IF EXISTS idx_forecasts_archived;

ALTER TABLE public.forecasts 
  DROP CONSTRAINT IF EXISTS forecasts_product_code_fkey;

DROP FUNCTION IF EXISTS public.archive_forecasts_for_import(TEXT, DATE, UUID);

DELETE FROM supabase_migrations WHERE name = '20260306_add_forecast_history';
*/