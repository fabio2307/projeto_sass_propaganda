import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    "SUA_URL",
    "SUA_ANON_KEY"
);

export async function login(email, password) {

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;

    localStorage.setItem("token", data.session.access_token);

    return data;
}