import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

export const config = {
    api: { bodyParser: false }
};

async function readRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).send("Método não permitido");
    }

    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(500).send("Stripe não configurado");
    }

    const sig = req.headers["stripe-signature"];

    if (!sig) {
        return res.status(400).send("Assinatura Stripe ausente");
    }

    let event;

    try {
        const rawBody = await readRawBody(req);

        event = stripe.webhooks.constructEvent(
            rawBody,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch {
        return res.status(400).send("Erro webhook");
    }

    if (event.type !== "checkout.session.completed") {
        return res.json({ received: true });
    }

    const session = event.data.object;
    const sessionId = session.id;
    const meta = session.metadata || {};
    const userId = meta.user_id;
    const amount = (session.amount_total || 0) / 100;

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: existing } = await supabase
        .from("transactions")
        .select("id")
        .eq("reference_id", sessionId)
        .maybeSingle();

    if (existing) {
        return res.json({ received: true });
    }

    if (!userId) {
        return res.status(400).json({ error: "user_id ausente" });
    }

    try {
        if (meta.purchase_type === "plan" && meta.plan) {
            const plan = String(meta.plan).toLowerCase();
            if (!["pro", "premium"].includes(plan)) {
                return res.status(400).json({ error: "Plano inválido" });
            }

            await supabase
                .from("users")
                .update({ plan })
                .eq("id", userId);

            await supabase.from("transactions").insert({
                user_id: userId,
                amount: 0,
                type: "plan_purchase",
                reference_id: sessionId,
                description: `Upgrade de plano: ${plan.toUpperCase()} (R$ ${amount.toFixed(2)})`
            });

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
            reference_id: sessionId,
            description: `Depósito via Stripe: R$ ${amount.toFixed(2)}`
        });
    } catch (e) {
        return res.status(500).json({ error: e.message || "Erro ao processar" });
    }

    return res.json({ received: true });
}
