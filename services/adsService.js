import { supabase } from "../lib/supabase";

export async function criarAd(ad) {
    return await supabase.from("ads").insert([ad]);
}

export async function listarAds() {
    return await supabase
        .from("ads")
        .select("*")
        .order("score", { ascending: false });
}

export function calcularScore(ad) {
    if (ad.views === 0) return 0;
    return (ad.clicks / ad.views) * 0.7 + (ad.bid * 0.3);
}