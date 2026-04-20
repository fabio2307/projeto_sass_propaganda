import { createClient } from '@supabase/supabase-js';
import { auditLog } from '../lib/utils.js';
import { maxAdsForPlan, canSetFeatured, normalizePlan } from './plans.js';

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

/**
 * Reserva saldo para o orçamento do anúncio (valor integral do orçamento).
 * Usa atualização condicional (saldo inalterado = mesma linha) para evitar
 * condição de corrida entre duas criações simultâneas.
 */
async function reserveBalanceAtomic(supabase, userId, amount) {
    const need = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(need) || need <= 0) {
        return { success: false, error: "Valor de orçamento inválido" };
    }

    const { data: userData, error: fetchError } = await supabase
        .from("users")
        .select("balance")
        .eq("id", userId)
        .maybeSingle();

    if (fetchError || !userData) {
        return { success: false, error: "Usuário não encontrado" };
    }

    const current = Math.round(Number(userData.balance ?? 0) * 100) / 100;
    if (current < need) {
        return {
            success: false,
            error: `Saldo insuficiente: você tem ${formatMoneyBRL(current)}, mas o orçamento do anúncio é ${formatMoneyBRL(need)}. Adicione saldo ou reduza o orçamento.`
        };
    }

    const expectedAfter = current - need;
    const { data: updated, error: updateError } = await supabase
        .from("users")
        .update({ balance: expectedAfter })
        .eq("id", userId)
        .eq("balance", current)
        .select("balance")
        .maybeSingle();

    if (updateError) {
        return { success: false, error: "Erro ao reservar saldo" };
    }

    if (!updated) {
        return {
            success: false,
            error: "Saldo insuficiente ou alterado em outra aba. Confira seu saldo e tente novamente."
        };
    }

    auditLog("BALANCE_RESERVED", userId, { amount: need, new_balance: updated.balance });
    return { success: true, newBalance: updated.balance };
}

function formatMoneyBRL(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

// 🔥 cria anúncio
async function createAd(supabase, user, { title, description, link, bid, budget }) {
    const validationError = validateAdInput({ title, description, link, bid, budget });
    if (validationError) {
        return { success: false, error: validationError };
    }

    const plan = normalizePlan(user.plan);
    const maxAds = maxAdsForPlan(plan);
    const { count } = await supabase
        .from("ads")
        .select('*', { count: 'exact', head: true })
        .eq("user_id", user.id);
    const n = count ?? 0;
    if (n >= maxAds) {
        const label = maxAds === Infinity ? "ilimitado" : String(maxAds);
        return {
            success: false,
            error: `Limite de ${label} anúncio(s) atingido para o plano ${plan.toUpperCase()}. Faça upgrade para criar mais.`
        };
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
        const { data: currentUser } = await supabase
            .from("users")
            .select("balance")
            .eq("id", user.id)
            .maybeSingle();
        
        if (currentUser) {
            const restoredBalance = currentUser.balance + budgetNumber;
            await supabase
                .from("users")
                .update({ balance: restoredBalance })
                .eq("id", user.id);
        }
        
        auditLog('CREATE_AD_FAILED', user.id, { reason: 'ad_insert_error', error: error.message });
        return { success: false, error: 'Erro ao criar anúncio. Seu saldo foi restaurado.' };
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

    if (featured !== undefined) {
        if (featured && !canSetFeatured(user.plan)) {
            return {
                success: false,
                error: "Apenas o plano PREMIUM permite anúncios em destaque."
            };
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