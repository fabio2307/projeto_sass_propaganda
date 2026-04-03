import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

    const token = req.headers.authorization?.replace("Bearer ", "");

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        }
    );

    const { data, error } = await supabase
        .from("ads")
        .select("*");

    // 🔥 RLS filtra automaticamente

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json(data);
}