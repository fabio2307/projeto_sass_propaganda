import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    const { ad_id } = req.body;

    const { data: ad } = await supabase
        .from("ads")
        .select("*")
        .eq("id", ad_id)
        .single();

    if (!ad) {
        return res.status(404).json({ error: "Ad não encontrado" });
    }

    const novoClicks = (ad.clicks || 0) + 1;
    const novoSpent = (ad.spent || 0) + ad.bid;

    // 🔥 ATUALIZA O ANÚNCIO
    await supabase
        .from("ads")
        .update({
            clicks: novoClicks,
            spent: novoSpent
        })
        .eq("id", ad_id);

    // 🔥 DESCONTA SALDO
    await supabase
        .from("users")
        .update({
            balance: dono.balance - ad.bid
        })
        .eq("id", ad.user_id);

    res.status(200).json({ ok: true });
}