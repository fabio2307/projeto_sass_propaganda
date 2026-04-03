import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    const { title, description, link, bid } = req.body;
    const user_id = req.headers["x-user-id"]; // ID do usuário vindo do header

    if (!title || !link || !user_id) {
        return res.status(400).json({ error: "Dados inválidos" });
    }

    const { data, error } = await supabase
        .from("ads")
        .insert([{
            title,
            description,
            link,
            bid,
            user_id,
            views: 0,
            clicks: 0,
            score: 0
        }])
        .select()
        .single();

    if (error) {
        console.error("CREATE AD ERROR:", error);
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ ok: true, ad: data });
}