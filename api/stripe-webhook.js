import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

export const config = {
    api: { bodyParser: false },
};

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).send("Método não permitido");
    }

    if (!stripe) {
        return res.status(500).send("Stripe não configurado");
    }

    const sig = req.headers['stripe-signature'];

    if (!sig) {
        return res.status(400).send("Assinatura Stripe ausente");
    }

    let event;

    try {
        const rawBody = await buffer(req);

        event = stripe.webhooks.constructEvent(
            rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error("WEBHOOK ERROR:", err.message);
        return res.status(400).send("Erro webhook");
    }

    // ================= PAGAMENTO CONCLUÍDO =================
    if (event.type === 'checkout.session.completed') {

        const session = event.data.object;

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const sessionId = session.id;
        const userId = session.metadata.user_id;

        const amount = session.amount_total / 100;

        if (!userId || !amount) {
            return res.status(400).json({ error: "Dados inválidos" });
        }

        // 🔥 EVITA DUPLICIDADE
        const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("stripe_session", sessionId)
            .maybeSingle();

        if (existing) {
            console.log("Pagamento já processado");
            return res.json({ received: true });
        }

        const { data: user } = await supabase
            .from("users")
            .select("balance")
            .eq("id", userId)
            .single();

        if (!user) {
            return res.status(404).json({ error: "Usuário não encontrado" });
        }

        await supabase
            .from("users")
            .update({
                balance: (user.balance || 0) + amount
            })
            .eq("id", userId);

        await supabase.from("transactions").insert({
            user_id: userId,
            amount: amount,
            type: "deposit",
            status: "completed",
            stripe_session: sessionId
        });
    }

    return res.json({ received: true });
}