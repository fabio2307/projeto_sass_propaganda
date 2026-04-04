import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
        return res.status(401).json({ error: "Token não enviado" });
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
            global: {
                headers: { Authorization: `Bearer ${token}` }
            }
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return res.status(401).json({ error: "Usuário inválido" });
    }

    const { data, error } = await supabase
        .from("users")
        .select("balance")
        .eq("id", user.id)
        .single();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json(data);
}