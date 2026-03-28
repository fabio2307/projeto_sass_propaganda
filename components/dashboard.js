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