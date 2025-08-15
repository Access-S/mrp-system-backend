import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  const error = 'Missing Supabase configuration. Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env file';
  logger.error(error);
  throw new Error(error);
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch {
  throw new Error('Invalid SUPABASE_URL format');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

logger.info('✅ Supabase client initialized successfully');