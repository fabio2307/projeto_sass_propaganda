// lib/adsService.js
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

// 🔥 sanitização básica contra XSS
function sanitize(str) {
    // Escapa caracteres HTML perigosos
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
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
    try {
        const url = new URL(link);
        if (!['http:', 'https:'].includes(url.protocol)) {
            return "Apenas URLs HTTP/HTTPS são permitidas";
        }
    } catch {
        return "Link inválido";
    }
    const bidNumber = Number(bid);
    const budgetNumber = Number(budget);
    if (isNaN(bidNumber) || bidNumber < 1) {
        return "Bid deve ser pelo menos 1";
    }
    if (isNaN(budgetNumber) || budgetNumber < bidNumber) {
        return "Orçamento deve ser pelo menos igual ao bid";
    }
    return null; // válido
}

// 🔥 reset diário para controle de gastos
function resetDailyIfNeeded(ad) {
    const today = new Date().toISOString().split("T")[0];
    if (ad.last_reset !== today) {
        ad.daily_spent = 0;
        ad.last_reset = today;
    }
    return ad;
}

// 🔥 verifica se anúncio é elegível
function isAdEligible(ad) {
    if (ad.status !== "active") return false;
    if ((ad.remaining || 0) <= 0) return false;
    if (ad.daily_budget > 0 && ad.daily_spent >= ad.daily_budget) return false;
    return true;
}

// 🔥 calcula score para ranking
function calculateAdScore(ad) {
    const ctr = ad.views > 0 ? (ad.clicks / ad.views) : 0;
    const ageHours = ad.created_at
        ? Math.max((Date.now() - new Date(ad.created_at)) / 3600000, 0)
        : 0;
    const novidade = Math.max(0, 1 - ageHours / 24); // bônus para anúncios < 24h
    let score =
        (ad.bid || 0) * 0.6 +
        (ctr * 100) * 0.3 +
        novidade * 0.1;
    if (ad.is_featured) score += 10; // bônus para destaque
    return score;
}

// 🔥 rate limit para cliques
async function checkRateLimitDB(supabase, ip, adId) {
    try {
        const from = new Date(Date.now() - 5000).toISOString();
        const { data, error } = await supabase
            .from("click_logs")
            .select("id")
            .eq("ip", ip)
            .eq("ad_id", adId)
            .gte("created_at", from);
        if (error) {
            console.error("Erro rate limit:", error);
            return true;
        }
        const total = data ? data.length : 0;
        return total < 1; // 1 clique em 5s por IP/ad
    } catch (err) {
        console.error("Erro inesperado rate limit:", err);
        return true;
    }
}

export {
    sanitize,
    validateAdInput,
    resetDailyIfNeeded,
    isAdEligible,
    calculateAdScore,
    checkRateLimitDB
};