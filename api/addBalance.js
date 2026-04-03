export default async function handler(req, res) {
    const user = getUserFromToken(req);
    const { ad_id } = req.body;

    const { data: ad } = await supabase
        .from("ads")
        .select("*")
        .eq("id", ad_id)
        .single();

    // 🔒 impedir dono de clicar no próprio anúncio
    if (ad.user_id === user.id) {
        return res.status(400).json({ error: "Ação inválida" });
    }

    // pegar dono do anúncio
    const { data: dono } = await supabase
        .from("users")
        .select("balance")
        .eq("id", ad.user_id)
        .single();

    if (dono.balance < ad.bid) {
        return res.status(400).json({ error: "Saldo insuficiente" });
    }

    // 💸 desconta saldo
    await supabase
        .from("users")
        .update({ balance: dono.balance - ad.bid })
        .eq("id", ad.user_id);

    // 📊 incrementa clique
    await supabase
        .from("ads")
        .update({ clicks: ad.clicks + 1 })
        .eq("id", ad_id);

    // 🧾 registra transação
    await supabase.from("transactions").insert({
        user_id: ad.user_id,
        amount: -ad.bid,
        type: "click"
    });

    res.json({ success: true });
}