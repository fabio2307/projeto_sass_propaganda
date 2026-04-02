import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    const { ad_id } = req.body;

    if (!ad_id) {
        return res.status(400).json({ error: "ad_id obrigatório" });
    }

    // pega anúncio atual
    const { data: ad, error: fetchError } = await supabase
        .from("ads")
        .select("*")
        .eq("id", ad_id)
        .single();

    if (fetchError || !ad) {
        return res.status(404).json({ error: "Ad não encontrado" });
    }

    const novoClicks = (ad.clicks || 0) + 1;
    const novoSpent = (ad.spent || 0) + ad.bid;

    const { error } = await supabase
        .from("ads")
        .update({
            clicks: novoClicks,
            spent: novoSpent
        })
        .eq("id", ad_id);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ ok: true });
}