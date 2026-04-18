const API = "/api";

// ================= ESCAPE HTML =================
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ================= SAFE JSON =================
async function safeJson(res) {
    const text = await res.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("Erro inesperado do servidor");
    }

    // 🔥 TRATAMENTO DE TOKEN EXPIRADO
    if (data.error === "Token inválido") {
        localStorage.clear();
        showToast("Sessão expirada. Faça login novamente.", "error");
        window.location.href = "/index.html";
        return;
    }

    if (!res.ok) {
        return data; // 🔥 deixa o login tratar o erro
    }

    return data;
}

// ================= TOKEN =================
function getToken() {
    const token = localStorage.getItem("token");
    return token && token !== "undefined" ? token : null;
}

// ================= TOKEN =================
function setToken(token) {
    localStorage.setItem("token", token);
}

function showToast(message, type = "info") {
    let container = document.getElementById("toastContainer");

    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.style.position = "fixed";
        container.style.right = "20px";
        container.style.top = "20px";
        container.style.zIndex = "9999";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "10px";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.innerText = message;
    toast.style.padding = "14px 18px";
    toast.style.borderRadius = "12px";
    toast.style.color = "#fff";
    toast.style.boxShadow = "0 12px 30px rgba(0,0,0,0.16)";
    toast.style.maxWidth = "320px";
    toast.style.fontSize = "14px";
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    toast.style.transform = "translateY(-10px)";

    if (type === "error") {
        toast.style.background = "#ef4444";
    } else if (type === "success") {
        toast.style.background = "#22c55e";
    } else {
        toast.style.background = "#0f172a";
    }

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-10px)";
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}

// ================= LOGOUT =================
function logout() {
    localStorage.clear();
    window.location.href = "/index.html";
}

// ================= LOGIN/REGISTER =================
function showRegister() {
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("registerBox").classList.remove("hidden");
}

// ================= LOGIN/REGISTER =================
function showLogin() {
    document.getElementById("registerBox").classList.add("hidden");
    document.getElementById("loginBox").classList.remove("hidden");
}

// ================= REGISTER =================
async function register() {
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    // Validação frontend
    if (!name || name.length < 2) {
        showToast("Nome deve ter pelo menos 2 caracteres", "error");
        return;
    }
    if (!email || !email.includes("@")) {
        showToast("Email inválido", "error");
        return;
    }
    if (!password || password.length < 8) {
        showToast("Senha deve ter pelo menos 8 caracteres", "error");
        return;
    }

    const btn = document.querySelector("#registerBox button");
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Criando conta...";
    }

    try {
        const res = await fetch(`${API}?action=register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: document.getElementById("registerName").value,
                birthDate: document.getElementById("registerBirth").value,
                email: document.getElementById("registerEmail").value,
                password: document.getElementById("registerPassword").value
            })
        });

        const data = await safeJson(res);

        if (!res.ok) {
            throw new Error(data.error || "Erro ao criar conta");
        }

        showToast("Conta criada! Verifique seu email antes de entrar 📩", "success");

        limparCamposCadastro();
        showLogin();

    } catch (err) {
        showToast("Erro: " + err.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Criar conta";
        }
    }
}

// ================= REENVIAR VERIFICAÇÃO =================
let countdown = 0;

async function resendVerification() {
    try {
        const email = document.getElementById("loginEmail").value;

        if (!email) {
            showToast("Digite seu email para reenviar a verificação", "error");
            return;
        }

        const res = await fetch(`${API}?action=resend`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email }) // ✅ AQUI ESTÁ A CORREÇÃO
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Erro ao reenviar");
        }

        showToast("Email de verificação reenviado!", "success");

    } catch (err) {
        showToast(err.message, "error");
    }
}

// ================= CONTADOR DE REENVIO =================
function startCountdown(btn) {
    countdown = 60;

    btn.classList.add("disabled");

    const interval = setInterval(() => {
        countdown--;

        btn.innerText = `Reenviar (${countdown}s)`;

        if (countdown <= 0) {
            clearInterval(interval);

            btn.innerText = "Reenviar verificação";
            btn.classList.remove("disabled");
        }
    }, 1000);
}

// ================= LIMPAR CAMPOS DE CADASTRO =================
function limparCamposCadastro() {
    document.getElementById("formRegister").reset();
}

// ================= LOGIN =================
async function login() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    // Validação frontend
    if (!email || !email.includes("@")) {
        showToast("Email inválido", "error");
        return;
    }
    if (!password) {
        showToast("Digite sua senha", "error");
        return;
    }

    const btn = document.getElementById("btnLogin");

    try {
        // 🔒 ativa loading
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Entrando...";
        }

        const res = await fetch(`${API}?action=login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
        });

        const data = await safeJson(res);

        // 🚫 se safeJson já redirecionou
        if (!data) return;

        if (data.error) {
            let msg = data.error;
            if (data.missing && Array.isArray(data.missing)) {
                msg += ` (faltando: ${data.missing.join(", ")})`;
            }
            throw new Error(msg);
        }

        if (!data.token) {
            throw new Error("Login inválido");
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("userId", data.user.id);

        document.getElementById("loginBox").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");

        // mostrar formulário de criação de anúncio
        const createAd = document.querySelector(".create-ad");
        if (createAd) createAd.style.display = "block";

        await carregarSaldo();
        await carregarAds();

        showToast("Login realizado!", "success");

    } catch (err) {

        if (err.message.includes("Verifique seu email")) {

            showToast("📩 Verifique seu email antes de fazer login", "info");

            const resendBox = document.getElementById("resendBox");
            if (resendBox) {
                resendBox.classList.remove("hidden");
            }

        } else {
            showToast("Erro no login: " + err.message, "error");
        }

    } finally {
        // 🔓 SEMPRE libera botão (mesmo com erro)
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Entrar";
        }
    }
}

// ================= CALCULAR IDADE =================
function calcularIdade(data) {
    if (!data) return "";

    const hoje = new Date();
    const nascimento = new Date(data);

    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();

    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
        idade--;
    }

    return idade;
}

// ================= SALDO =================
async function carregarSaldo() {
    try {
        const token = getToken();

        const res = await fetch(`${API}?action=getUser`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await safeJson(res);

        document.getElementById("saldo").innerText = formatMoney(data.balance || 0);

    } catch (err) {
        showToast(err.message, "error");
    }
}

// ================= CARREGAR TRANSAÇÕES =================
async function carregarTransacoes() {
    try {
        const res = await fetch(`${API}?action=transactions`, {
            headers: {
                "Authorization": `Bearer ${getToken()}`
            }
        });

        const transactions = await res.json();

        renderTransactions(transactions);

    } catch (err) {
        showToast(err.message, "error");
    }
}

// ================= RENDER TRANSAÇÕES =================
function renderTransactions(transactions) {
    const container = document.getElementById("transactions");

    if (!transactions || transactions.length === 0) {
        container.innerHTML = "<p>Nenhuma transação encontrada.</p>";
        return;
    }

    container.innerHTML = `
        <table class="transactions-table">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th>Descrição</th>
                </tr>
            </thead>
            <tbody>
                ${transactions.map(t => `
                    <tr>
                        <td>${new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                        <td>${t.type || 'Transação'}</td>
                        <td class="${t.amount >= 0 ? 'positive' : 'negative'}">${formatMoney(t.amount)}</td>
                        <td>${t.description || ''}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

// ================= API =================
function renderAds(ads) {
    const container = document.getElementById("ads");
    const userId = localStorage.getItem("userId") || "";

    // 🔥 contabiliza views
    setTimeout(() => {
        ads.forEach(ad => {

            const viewed = `viewed_${ad.id}`;

            if (!sessionStorage.getItem(viewed)) {
                sessionStorage.setItem(viewed, "true");

                fetch(`${API}?action=view`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ adId: ad.id })
                });
            }

        });
    }, 1000);

    container.innerHTML = ads.map(ad => {
        const ctr = ad.views > 0
            ? ((ad.clicks / ad.views) * 100).toFixed(1)
            : 0;

        return `
        <div class="ad-card">

            <h3>${escapeHTML(ad.title)}</h3>
            <p>${escapeHTML(ad.description || "")}</p>

            <a href="${escapeHTML(ad.link)}" target="_blank" rel="noopener noreferrer"
               onclick="registrarClick('${ad.id}')">
                🔗 Ver oferta
            </a>

            <div class="ad-metrics">
                <span>👁 ${ad.views || 0} visualizações</span>
                <span>🖱 ${ad.clicks || 0} cliques</span>
                <span>📊 ${ctr}% CTR</span>
                <span>💸 Gasto: ${formatMoney(ad.spent || 0)}</span>
            </div>

            <div class="ad-status">
                <span class="status-${ad.status || 'unknown'}">${ad.status || 'Desconhecido'}</span>
            </div>

            <div class="ad-extra">
                <span>💰 Lance: ${formatMoney(ad.bid)}</span>
                <span>⏳ Restante: ${formatMoney(ad.remaining || 0)}</span>
                <span>📌 Status: ${escapeHTML(ad.status || "active")}</span>
            </div>

            ${ad.user_id == userId ? `
                <button onclick="toggleAd('${ad.id}', '${ad.status}')">
                    ${ad.status === "active" ? "⏸ Pausar" : "▶ Ativar"}
                </button>
            ` : ""}

        </div>
        `;
    }).join("");
}

// ================= CLICK =================
async function registrarClick(adId) {
    try {
        // 🔒 antifraude (1 clique por sessão)
        const key = `clicked_${adId}`;

        if (sessionStorage.getItem(key)) {
            return;
        }

        sessionStorage.setItem(key, "true");

        const res = await fetch(`${API}?action=click`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ adId })
        });

        const data = await res.json();

        // 🚫 bloqueio imediato
        if (data?.blocked) {
            showToast("Clique bloqueado por segurança", "error");
            return;
        }

        if (data?.paused) {
            showToast("⚠️ Anúncio pausado por saldo insuficiente", "error");
        }

        if (data?.error) {
            showToast(data.error, "error");
        }

        const lastClick = localStorage.getItem(key);
        const now = Date.now();

        // ⏳ bloqueio de clique repetido (1 por minuto)
        if (lastClick && now - lastClick < 60000) {
            return;
        }

        localStorage.setItem(key, now);

    } catch (err) {
        showToast("Erro ao registrar clique", "error");
    }
}

// ================= STATS =================
function atualizarStats(ads) {
    const totalAds = ads.length;
    const totalClicks = ads.reduce((acc, ad) => acc + (ad.clicks || 0), 0);
    const totalViews = ads.reduce((acc, ad) => acc + (ad.views || 0), 0);

    document.getElementById("totalAds").innerText = totalAds;
    document.getElementById("totalClicks").innerText = totalClicks;
    document.getElementById("totalViews").innerText = totalViews;
}

// ================= CRIAR AD =================
async function criarAd() {
    const btn = document.querySelector("#createAdForm button");
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Criando anúncio...";
    }

    try {
        const title = document.getElementById("title").value;
        const description = document.getElementById("description").value;
        const link = document.getElementById("link").value;
        const bid = parseMoney(document.getElementById("bid").value);
        const budget = parseMoney(document.getElementById("budget").value);

        // Validações específicas e detalhadas
        if (!title) {
            throw new Error("Título é obrigatório");
        }
        if (title.length < 3) {
            throw new Error("Título deve ter pelo menos 3 caracteres");
        }
        if (title.length > 100) {
            throw new Error("Título deve ter no máximo 100 caracteres");
        }

        if (!description) {
            throw new Error("Descrição é obrigatória");
        }
        if (description.length < 10) {
            throw new Error("Descrição deve ter pelo menos 10 caracteres");
        }
        if (description.length > 500) {
            throw new Error("Descrição deve ter no máximo 500 caracteres");
        }

        if (!link) {
            throw new Error("Link é obrigatório");
        }
        try {
            new URL(link);
        } catch {
            throw new Error("Link deve ser uma URL válida (ex: https://exemplo.com)");
        }

        if (isNaN(bid) || bid <= 0) {
            throw new Error("Lance deve ser um valor válido maior que zero");
        }
        if (bid < 1) {
            throw new Error("Lance mínimo é R$ 1,00");
        }

        if (isNaN(budget) || budget <= 0) {
            throw new Error("Orçamento deve ser um valor válido maior que zero");
        }
        if (budget < 5) {
            throw new Error("Orçamento mínimo é R$ 5,00");
        }

        const res = await fetch(`${API}?action=createAd`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({ title, description, link, bid, budget })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Erro ao criar anúncio");
        }

        showToast("Anúncio criado com sucesso! 🎉", "success");

        document.getElementById("title").value = "";
        document.getElementById("description").value = "";
        document.getElementById("link").value = "";
        document.getElementById("bid").value = "";
        document.getElementById("title").focus();

        await carregarAds();
        await carregarSaldo(); // Atualizar saldo em tempo real

    } catch (err) {
        showToast(err.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">🚀</span> Criar Anúncio';
        }
    }
}

// ================= VALIDAÇÃO EM TEMPO REAL =================
function setupRealTimeValidation() {
    const titleInput = document.getElementById("title");
    const descriptionInput = document.getElementById("description");
    const linkInput = document.getElementById("link");
    const bidInput = document.getElementById("bid");
    const budgetInput = document.getElementById("budget");

    if (titleInput) {
        titleInput.addEventListener("input", function() {
            const length = this.value.length;
            const counter = this.parentElement.querySelector("small");
            if (counter) {
                counter.textContent = `${length}/100 caracteres`;
                counter.style.color = length > 100 ? "#ef4444" : length < 3 ? "#f59e0b" : "#10b981";
            }
        });
    }

    if (descriptionInput) {
        descriptionInput.addEventListener("input", function() {
            const length = this.value.length;
            const counter = this.parentElement.querySelector("small");
            if (counter) {
                counter.textContent = `${length}/500 caracteres`;
                counter.style.color = length > 500 ? "#ef4444" : length < 10 ? "#f59e0b" : "#10b981";
            }
        });
    }

    if (linkInput) {
        linkInput.addEventListener("input", function() {
            const isValid = this.value.startsWith("https://") || this.value.startsWith("http://");
            this.style.borderColor = isValid ? "#10b981" : this.value ? "#f59e0b" : "#1e293b";
        });
    }
}

// Chamar quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", function() {
    setupRealTimeValidation();
});

let loadingAds = false;

// ================= ADS =================
async function carregarAds() {

    if (loadingAds) return;
    loadingAds = true;

    const adsContainer = document.getElementById("ads");
    if (adsContainer) {
        adsContainer.innerHTML = `
            <div class="ad-card skeleton"></div>
            <div class="ad-card skeleton"></div>
            <div class="ad-card skeleton"></div>
        `;
    }

    try {
        const res = await fetch(`${API}?action=myAds`, {
            headers: {
                Authorization: `Bearer ${getToken()}`
            }
        });

        const ads = await safeJson(res);

        renderAds(ads);
        atualizarStats(ads);

    } catch (err) {
        showToast(err.message, "error");
    } finally {
        loadingAds = false;
    }
}

// ================= AUTO REFRESH ADS =================
setInterval(() => {
    if (getToken()) {
        carregarAds();
    }
}, 30000); // 30 segundos

// ================= PAGAMENTO =================
async function pagar() {
    try {
        const raw = document.getElementById("valor").value
            .replace("R$ ", "")
            .replace(/\./g, "")
            .replace(",", ".");

        const amount = Number(raw);

        if (!amount || amount <= 0) {
            throw new Error("Valor inválido");
        }

        const res = await fetch(`${API}?action=createCheckout`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({ amount })
        });

        const data = await safeJson(res);

        // ✅ abre em nova guia
        window.open(data.url, "_blank");

    } catch (err) {
        showToast(err.message, "error");
    }
}

// ================= FORMATAÇÃO DE MOEDA =================
function formatMoneyInput(input) {
    let value = input.value.replace(/\D/g, "");

    if (value === "") {
        input.value = "";
        return;
    }

    value = (Number(value) / 100).toFixed(2);
    input.value = "R$ " + value.replace(".", ",");
}

// ================= FORMATAÇÃO DE MOEDA (LEGACY) =================
function formatarMoeda(input) {
    let value = input.value.replace(/\D/g, "");

    value = (value / 100).toFixed(2) + "";
    value = value.replace(".", ",");

    value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    input.value = "R$ " + value;
}

// ================= PARSE DE MOEDA =================
function parseMoney(value) {
    return Number(
        String(value)
            .replace("R$", "")
            .replace(/\./g, "")
            .replace(",", ".")
            .trim()
    );
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

// ================= VALIDAÇÃO DE ORÇAMENTO =================
function validateBudget(input) {
    const value = parseMoney(input.value);
    const minBudget = 5.00;

    if (value > 0 && value < minBudget) {
        showToast(`Orçamento mínimo: R$ ${minBudget.toFixed(2).replace(".", ",")}`, "warning");
        input.style.borderColor = "#f59e0b";
        return false;
    } else {
        input.style.borderColor = "#1e293b";
        return true;
    }
}

// ================= INICIALIZAÇÃO =================
async function init() {
    const token = getToken();

    // 🔒 se não estiver logado, não faz nada
    if (!token) {
        return;
    }

    // esconder login (se existir)
    const loginBox = document.getElementById("loginBox");
    if (loginBox) loginBox.classList.add("hidden");

    // mostrar dashboard (se existir)
    const dashboard = document.getElementById("dashboard");
    if (dashboard) dashboard.classList.remove("hidden");

    // mostrar seções protegidas
    const createAd = document.querySelector(".create-ad");
    if (createAd) createAd.style.display = "block";

    try {
        await carregarSaldo();
        await carregarAds();
    } catch (err) {
        showToast("Erro ao iniciar o dashboard", "error");
    }

    // 🔥 retorno de pagamento
    if (window.location.search.includes("success")) {
        showToast("Pagamento aprovado!", "success");
        await carregarSaldo();
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ================= TOGGLE AD =================
async function toggleAd(adId, status) {
    try {
        const token = localStorage.getItem("token"); // 👈 IMPORTANTE

        const res = await fetch(`/api?action=toggleAd`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` // 👈 AQUI ESTÁ O SEGREDO
            },
            body: JSON.stringify({
                id: adId, // 👈 backend espera "id"
                status: status === "active" ? "paused" : "active"
            })
        });

        const data = await res.json();

        if (data.error) {
            showToast(data.error, "error");
            return;
        }

        // atualiza lista
        if (typeof carregarAds === "function") {
            carregarAds();
        } else if (typeof carregarAdsPublicos === "function") {
            carregarAdsPublicos();
        }

    } catch (err) {
        showToast("Ocorreu um erro inesperado", "error");
    }
}

// ================= DOM CONTENT LOADED =================
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btnLogin");
    const birthInput = document.getElementById("registerBirth");
    const ageInput = document.getElementById("registerAge");
    const valorInput = document.getElementById("valor");

    // 🔥 eventos
    if (btn) {
        btn.addEventListener("click", login);
    }

    // 🔥 calcula idade ao escolher data de nascimento
    if (birthInput && ageInput) {
        birthInput.addEventListener("change", () => {
            ageInput.value = calcularIdade(birthInput.value);
        });
    }

    // 🔥 formata campo de valor
    if (valorInput) {
        valorInput.addEventListener("input", () => formatarMoeda(valorInput));
    }

    init(); // 🔥 chama aqui dentro
});


// ================= EXPORT =================
window.init = init;
window.register = register;
window.pagar = pagar;
window.logout = logout;
window.carregarAds = carregarAds;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.criarAd = criarAd;
window.resendVerification = resendVerification;
window.carregarTransacoes = carregarTransacoes;
window.formatMoneyInput = formatMoneyInput;
window.validateBudget = validateBudget;
