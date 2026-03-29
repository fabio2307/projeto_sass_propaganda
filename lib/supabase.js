const SUPABASE_URL = SUA_CHAVE_URL;
const SUPABASE_ANON_KEY = SUA_CHAVE_ANON;

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 🔥 deixa global (resolve seu erro)
window.supabaseClient = supabaseClient;