import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 🔥 ESSENCIAL na Vercel (senão quebra o webhook)
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).send("Método não permitido");
    }

    const sig = req.headers['stripe-signature'];

    let event;

    try {
        const rawBody = await buffer(req);

        event = stripe.webhooks.constructEvent(
            rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

    } catch (err) {
        console.error("Erro webhook:", err.message);
        return res.status(400).send(`Webhook Error`);
    }

    // 🔥 PAGAMENTO CONFIRMADO
    if (event.type === 'checkout.session.completed') {

        try {

            const session = event.data.object;

            const supabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_SERVICE_KEY // 🔥 IMPORTANTE (admin)
            );

            const userId = session.metadata?.user_id;
            const amount = session.amount_total / 100;

            if (!userId) {
                console.error("user_id não encontrado no metadata");
                return res.status(400).send("Erro metadata");
            }

            // 🔎 pega usuário
            const { data: user, error } = await supabase
                .from("users")
                .select("balance")
                .eq("id", userId)
                .single();

            if (error || !user) {
                console.error("Usuário não encontrado");
                return res.status(400).send("Usuário inválido");
            }

            // 💰 atualiza saldo
            const { error: updateError } = await supabase
                .from("users")
                .update({
                    balance: user.balance + amount
                })
                .eq("id", userId);

            if (updateError) {
                console.error(updateError);
                return res.status(500).send("Erro ao atualizar saldo");
            }

            // 🧾 registra transação
            await supabase.from("transactions").insert({
                user_id: userId,
                amount: amount,
                type: "deposit"
            });

            console.log("Pagamento confirmado:", userId, amount);

        } catch (err) {
            console.error("Erro interno:", err);
            return res.status(500).send("Erro interno");
        }
    }

    res.status(200).json({ received: true });
}