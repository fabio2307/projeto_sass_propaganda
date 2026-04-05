export default async function handler(req, res) {

    const { action } = req.query;

    try {

        // ================= LOGIN FAKE (TESTE) =================
        if (action === "login") {

            const { email, password } = req.body || {};

            if (!email || !password) {
                return res.status(400).json({ error: "Dados inválidos" });
            }

            return res.json({
                token: "fake-token",
                user: { email }
            });
        }

        // ================= REGISTER =================
        if (action === "register") {
            return res.json({ ok: true });
        }

        // ================= USER =================
        if (action === "getUser") {
            return res.json({
                balance: 100
            });
        }

        // ================= CHECKOUT =================
        if (action === "createCheckout") {
            return res.json({
                url: "https://checkout.stripe.com"
            });
        }

        // ================= ADS =================
        if (action === "createAd") {
            return res.json({ ok: true });
        }

        if (action === "myAds") {
            return res.json([
                {
                    id: 1,
                    title: "Produto Teste",
                    description: "Descrição teste",
                    link: "https://google.com",
                    bid: 2,
                    clicks: 5,
                    views: 20
                }
            ]);
        }

        if (action === "clickAd") {
            return res.json({ ok: true });
        }

        return res.json({ ok: true });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro interno" });
    }
}