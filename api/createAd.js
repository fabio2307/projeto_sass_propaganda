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

    const { title, description, link, bid } = req.body;

    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
        return res.status(401).json({ error: "Não autenticado" });
    }

    const { data, error } = await supabase
        .from("ads")
        .insert([{
            title,
            description,
            link,
            bid,
            user_id: user.id,
            views: 0,
            clicks: 0
        }])
        .select()
        .single();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ ok: true, ad: data });
}