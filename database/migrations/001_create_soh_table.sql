-- BLOCK 1: Create SOH Table Migration
-- File: backend/database/migrations/001_create_soh_table.sql

-- Create the base SOH table with minimal required columns
CREATE TABLE IF NOT EXISTS public.soh (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    import_batch_id UUID DEFAULT gen_random_uuid(),
    import_source TEXT DEFAULT 'manual_upload'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_soh_product_id ON public.soh(product_id);
CREATE INDEX IF NOT EXISTS idx_soh_created_at ON public.soh(created_at);
CREATE INDEX IF NOT EXISTS idx_soh_import_batch_id ON public.soh(import_batch_id);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE public.soh ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on soh" ON public.soh
    FOR ALL USING (true);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_soh_updated_at 
    BEFORE UPDATE ON public.soh 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to add columns dynamically
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
    table_name TEXT,
    column_name TEXT,
    column_type TEXT DEFAULT 'TEXT'
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = table_name 
        AND column_name = column_name
    ) THEN
        -- Add the column
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s', table_name, column_name, column_type);
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON public.soh TO authenticated;
GRANT ALL ON public.soh TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;