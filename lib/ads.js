import { createClient } from '@supabase/supabase-js';
import { auditLog } from '../lib/utils.js';

function getSupabase() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Supabase não configurado");
    }
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// 🔥 sanitização básica contra XSS
function sanitizeText(text) {
    return String(text)
        .trim()
        .replace(/[<>]/g, "")
        .slice(0, 255);
}

// 🔥 valida URL rigorosamente
function validateUrl(url) {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

// 🔥 validação rigorosa para anúncios
function validateAdInput({ title, description, link, bid, budget }) {
    if (!title || title.length < 3 || title.length > 255) {
        return "Título deve ter entre 3 e 255 caracteres";
    }
    if (!description || description.length < 10 || description.length > 255) {
        return "Descrição deve ter entre 10 e 255 caracteres";
    }
    if (!link) {
        return "Link é obrigatório";
    }
    if (!validateUrl(link)) {
        return "Link deve ser uma URL válida (http/https)";
    }
    const bidNumber = Number(bid);
    const budgetNumber = Number(budget);
    if (isNaN(bidNumber) || bidNumber < 1) {
        return "Bid deve ser pelo menos 1";
    }
    if (isNaN(budgetNumber) || budgetNumber < bidNumber) {
        return "Orçamento deve ser pelo menos igual ao bid";
    }
    return null;
}

// 🔥 reserva saldo atomicamente
async function reserveBalanceAtomic(supabase, userId, amount) {
    const { data, error } = await supabase
        .from("users")
        .update({ balance: supabase.raw('balance - ?', [amount]) })
        .eq("id", userId)
        .gte("balance", amount)
        .select("balance");

    if (error || !data || data.length === 0) {
        return { success: false, error: "Saldo insuficiente" };
    }

    auditLog('BALANCE_RESERVED', userId, { amount, new_balance: data[0].balance });
    return { success: true, newBalance: data[0].balance };
}

// 🔥 cria anúncio
async function createAd(supabase, user, { title, description, link, bid, budget }) {
    const validationError = validateAdInput({ title, description, link, bid, budget });
    if (validationError) {
        return { success: false, error: validationError };
    }

    // Verificar limite de anúncios por plano
    const maxAds = user.plan === 'PRO' ? 100 : 5;
    const { count } = await supabase
        .from("ads")
        .select('*', { count: 'exact', head: true })
        .eq("user_id", user.id);
    if (count >= maxAds) {
        return { success: false, error: `Limite de ${maxAds} anúncios atingido para seu plano` };
    }

    const bidNumber = Number(String(bid).replace(/[^\d.-]/g, "").replace(",", "."));
    const budgetNumber = Number(String(budget).replace(/[^\d.-]/g, "").replace(",", "."));

    // Reserva saldo atomicamente
    const balanceResult = await reserveBalanceAtomic(supabase, user.id, budgetNumber);
    if (!balanceResult.success) {
        auditLog('CREATE_AD_FAILED', user.id, { reason: 'insufficient_balance', budget: budgetNumber });
        return { success: false, error: balanceResult.error };
    }

    const safeTitle = sanitizeText(title);
    const safeDescription = sanitizeText(description);
    const safeLink = new URL(link).href;

    const { data, error } = await supabase
        .from("ads")
        .insert([{
            user_id: user.id,
            title: safeTitle,
            description: safeDescription,
            link: safeLink,
            bid: bidNumber,
            budget: budgetNumber,
            reserved_budget: budgetNumber,
            spent: 0,
            remaining: budgetNumber,
            daily_budget: budgetNumber / 30,
            daily_spent: 0,
            clicks: 0,
            views: 0,
            status: "active",
            is_featured: false
        }])
        .select();

    if (error) {
        // Rollback do saldo
        await supabase
            .from("users")
            .update({ balance: supabase.raw('balance + ?', [budgetNumber]) })
            .eq("id", user.id);
        auditLog('CREATE_AD_FAILED', user.id, { reason: 'ad_insert_error', error: error.message });
        return { success: false, error: error.message };
    }

    auditLog('AD_CREATED', user.id, { ad_id: data[0].id, budget: budgetNumber });
    return { success: true, ad: data[0] };
}

// 🔥 lista anúncios do usuário com filtros
async function getUserAds(supabase, userId, { status, search }) {
    let query = supabase
        .from("ads")
        .select("*")
        .eq("user_id", userId);

    if (status && ["active", "paused", "inactive"].includes(status)) {
        query = query.eq("status", status);
    }

    if (search) {
        query = query.ilike("title", `%${search}%`);
    }

    const { data } = await query.order("created_at", { ascending: false });
    return data || [];
}

// 🔥 toggle anúncio
async function toggleAd(supabase, user, { id, status, featured }) {
    if (!id || !["active", "paused", "inactive"].includes(status)) {
        return { success: false, error: "Dados inválidos" };
    }

    const { data: ad } = await supabase
        .from("ads")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (!ad) {
        return { success: false, error: "Anúncio não encontrado" };
    }

    if (ad.user_id !== user.id) {
        return { success: false, error: "Sem permissão" };
    }

    const updates = { status };

    // Limita featured por plano
    if (featured !== undefined) {
        if (user.plan === 'free' && featured) {
            return { success: false, error: "Plano gratuito não permite anúncios em destaque" };
        }
        updates.is_featured = featured;
    }

    if (status === "inactive") {
        const refundAmount = Number(ad.remaining || 0);
        if (refundAmount > 0) {
            await supabase
                .from("users")
                .update({ balance: supabase.raw('balance + ?', [refundAmount]) })
                .eq("id", user.id);

            await supabase
                .from("transactions")
                .insert([{
                    user_id: user.id,
                    amount: refundAmount,
                    type: "refund",
                    reference_id: ad.id,
                    description: `Reembolso do anúncio: ${ad.title}`
                }]);

            updates.remaining = 0;
        }
    }

    const { error } = await supabase
        .from("ads")
        .update(updates)
        .eq("id", id);

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true };
}

export {
    createAd,
    getUserAds,
    toggleAd,
    validateAdInput,
    sanitizeText,
    validateUrl
};