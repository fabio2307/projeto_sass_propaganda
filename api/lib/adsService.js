import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================= CRUD =================

export async function criarAd(ad) {
    return await supabase.from("ads").insert([ad]);
}

export async function listarAds() {
    return await supabase
        .from("ads")
        .select("*")
        .order("score", { ascending: false });
}

// ================= IA =================

export function calcularScore(ad) {
    const ctr = ad.views > 0 ? (ad.clicks / ad.views) : 0;
    const ageHours = ad.created_at
        ? Math.max((Date.now() - new Date(ad.created_at)) / 3600000, 0)
        : 0;
    const recency = Math.max(0, 1 - ageHours / 72);
    const remainingFactor = Math.min((ad.remaining || 0) / Math.max(ad.budget || 1, 1), 1);
    const repetitionPenalty = Math.min((ad.views || 0) / 100, 0.2);

    return (
        (ad.bid || 0) * 0.6 +
        ctr * 0.2 +
        recency * 0.1 +
        remainingFactor * 0.1 -
        repetitionPenalty
    );
}

export async function otimizarAds() {
    const { data: ads } = await listarAds();

    for (const ad of ads || []) {
        const score = calcularScore(ad);

        let novoBid = ad.bid;

        if (score > 0.5) novoBid *= 1.1;
        else novoBid *= 0.9;

        await supabase.from("ads")
            .update({
                score,
                bid: Number(novoBid.toFixed(2))
            })
            .eq("id", ad.id);
    }
}