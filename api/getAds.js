import { createClient } from '@supabase/supabase-js';

if (!user_id || user_id === "undefined") {
    return res.status(400).json({ error: "user_id inválido" });
}

export default async function handler(req, res) {

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        const { user_id } = req.query;

        console.log("USER_ID:", user_id);

        if (!user_id) {
            return res.status(400).json({ error: "user_id é obrigatório" });
        }

        const { data, error } = await supabase
            .from("ads")
            .select("*")
            .eq("user_id", user_id) // 🔥 FILTRO PRINCIPAL
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json(data);

    } catch (err) {
        return res.status(500).json({ error: "Erro interno" });
    }

}