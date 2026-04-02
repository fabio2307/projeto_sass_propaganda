import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: "user_id obrigatório" });
    }

    const { data, error } = await supabase
        .from("ads")
        .select("*")
        .eq("user_id", user_id)
        .order("id", { ascending: false });

    if (error) {
        console.error("GET ADS ERROR:", error);
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json(data);
}