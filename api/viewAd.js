import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

    const { ad_id } = req.body;

    if (!ad_id) {
        return res.status(400).json({ error: "ad_id obrigatório" });
    }

    const { data: ad } = await supabase
        .from("ads")
        .select("views")
        .eq("id", ad_id)
        .single();

    const { error } = await supabase
        .from("ads")
        .update({
            views: (ad.views || 0) + 1
        })
        .eq("id", ad_id);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ ok: true });
}