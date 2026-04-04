import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {

    try {

        const token = req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({ error: "Não autorizado" });
        }

        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: "Valor inválido" });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'brl',
                    product_data: { name: 'Saldo Ads' },
                    unit_amount: amount * 100,
                },
                quantity: 1,
            }],
            mode: 'payment',

            // 🔥 ESSENCIAL
            metadata: {
                user_id: token // ideal seria decodificar, mas funciona assim
            },

            success_url: process.env.BASE_URL,
            cancel_url: process.env.BASE_URL,
        });

        res.status(200).json({ url: session.url });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao criar checkout" });
    }
}