import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

const baseUrl = () =>
    process.env.BASE_URL || "https://projeto-sass-propaganda.vercel.app";

// 🔥 cria sessão de checkout Stripe (crédito de saldo)
async function createStripeCheckout(userId, amount) {
    if (!stripe) throw new Error("Stripe não configurado");

    if (!amount || amount <= 0) {
        throw new Error("Valor inválido");
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "boleto"],
        mode: "payment",
        client_reference_id: userId,
        metadata: {
            user_id: userId,
            purchase_type: "balance",
            amount: amount.toString()
        },
        line_items: [{
            price_data: {
                currency: "brl",
                product_data: {
                    name: "Adicionar saldo"
                },
                unit_amount: Math.round(amount * 100)
            },
            quantity: 1
        }],
        success_url: `${baseUrl()}/?success=true`,
        cancel_url: `${baseUrl()}/?cancel=true`
    });

    return { url: session.url };
}

/**
 * Checkout único para upgrade de plano (PRO ou PREMIUM).
 * Valores em BRL ajustáveis por env (padrão compatível com MVP).
 */
async function createPlanCheckout(userId, plan) {
    if (!stripe) throw new Error("Stripe não configurado");

    const p = String(plan || "").toLowerCase();
    if (p !== "pro" && p !== "premium") {
        throw new Error("Plano inválido");
    }

    const proBrl = Number(process.env.STRIPE_PRO_PLAN_BRL || "29.90");
    const premBrl = Number(process.env.STRIPE_PREMIUM_PLAN_BRL || "79.90");
    const amount = p === "pro" ? proBrl : premBrl;
    const unitAmount = Math.round(amount * 100);
    if (!Number.isFinite(unitAmount) || unitAmount < 100) {
        throw new Error("Valor do plano inválido na configuração");
    }

    const label = p === "pro" ? "Plano PRO (até 20 anúncios)" : "Plano PREMIUM (anúncios ilimitados + destaque)";

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "boleto"],
        mode: "payment",
        client_reference_id: userId,
        metadata: {
            user_id: userId,
            purchase_type: "plan",
            plan: p
        },
        line_items: [{
            price_data: {
                currency: "brl",
                product_data: {
                    name: label
                },
                unit_amount: unitAmount
            },
            quantity: 1
        }],
        success_url: `${baseUrl()}/?plan_success=1`,
        cancel_url: `${baseUrl()}/?plan_cancel=1`
    });

    return { url: session.url };
}

async function processStripeWebhook(event, supabase) {
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const sessionId = session.id;
        const meta = session.metadata || {};
        const userId = meta.user_id;
        const amount = (session.amount_total || 0) / 100;

        const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("reference_id", sessionId)
            .maybeSingle();

        if (existing) return;

        if (!userId) throw new Error("user_id ausente no metadata");

        if (meta.purchase_type === "plan" && meta.plan) {
            const plan = String(meta.plan).toLowerCase();
            if (!["pro", "premium"].includes(plan)) {
                throw new Error("Plano inválido no webhook");
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
            return;
        }

        const { data: user } = await supabase
            .from("users")
            .select("balance")
            .eq("id", userId)
            .single();

        if (!user) throw new Error("Usuário não encontrado");

        await supabase
            .from("users")
            .update({ balance: (user.balance || 0) + amount })
            .eq("id", userId);

        await supabase.from("transactions").insert({
            user_id: userId,
            amount: amount,
            type: "deposit",
            reference_id: sessionId,
            description: `Depósito via Stripe: R$ ${amount.toFixed(2)}`
        });
    }
}

async function createPixPayment(amount) {
    throw new Error("PIX ainda não implementado");
}

export {
    createStripeCheckout,
    createPlanCheckout,
    processStripeWebhook,
    createPixPayment
};
