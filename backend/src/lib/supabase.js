import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const isPlaceholder =
  !supabaseUrl ||
  supabaseUrl.includes('placeholder') ||
  !supabaseKey ||
  supabaseKey.includes('placeholder');

let supabase = null;

if (!isPlaceholder) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase connected:', supabaseUrl);
} else {
  console.log('⚠️  Supabase not configured — running with in-memory mock DB');
}

export { supabase, isPlaceholder };
