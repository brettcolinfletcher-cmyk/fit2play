import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This is the client we use on the client side (login, dashboard, etc.)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);