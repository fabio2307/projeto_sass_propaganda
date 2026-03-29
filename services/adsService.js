import { supabase } from "../lib/supabase";

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
    if (ad.views === 0) return 0;
    return (ad.clicks / ad.views) * 0.7 + (ad.bid * 0.3);
}

export async function otimizarAds() {
    const { data: ads } = await listarAds();

    for (const ad of ads) {
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