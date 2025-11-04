
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

console.log(supabaseKey, supabaseUrl)

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

export default supabase
