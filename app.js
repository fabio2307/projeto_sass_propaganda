const API = "/api";

// ================= SAFE JSON =================
async function safeJson(res) {
    const text = await res.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        console.error("RESPOSTA NÃO JSON:", text);
        throw new Error("Erro inesperado do servidor");
    }

    // 🔥 TRATAMENTO DE TOKEN EXPIRADO
    if (data.error === "Token inválido") {
        localStorage.clear();
        alert("Sessão expirada. Faça login novamente.");
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
    try {
        const res = await fetch(`${API}?action=register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: document.getElementById("registerName").value,
                birthdate: document.getElementById("registerBirth").value, // ✅ corrigido
                email: document.getElementById("registerEmail").value,
                password: document.getElementById("registerPassword").value
            })
        });

        const data = await safeJson(res);

        alert("Conta criada! Verifique seu email antes de entrar 📩");

        // 🧹 limpa tudo automaticamente
        limparCamposCadastro();

        showLogin();

    } catch (err) {
        console.error(err);
        alert("Erro: " + err.message);
    }
}

// ================= REENVIAR VERIFICAÇÃO =================
let countdown = 0;

async function resendVerification() {
    const email = document.getElementById("loginEmail").value;
    const btn = document.getElementById("resendBtn");

    if (!email) {
        alert("Digite seu email primeiro");
        return;
    }

    // 🔥 bloqueia se já estiver contando
    if (countdown > 0) return;

    try {
        const res = await fetch(`${API}?action=resend`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email })
        });

        const data = await safeJson(res);

        alert("📩 Email de verificação reenviado!");

        // 🔥 inicia contador de 60s
        startCountdown(btn);

    } catch (err) {
        alert("Erro: " + err.message);
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
    const btn = document.getElementById("btnLogin");

    try {
        // 🔒 ativa loading
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Entrando...";
        }

        const emailInput = document.getElementById("loginEmail");
        const passwordInput = document.getElementById("loginPassword");

        if (!emailInput || !passwordInput) {
            throw new Error("Erro de interface. Recarregue a página.");
        }

        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            throw new Error("Preencha email e senha");
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

        // 🔥 trata erro da API corretamente
        if (data.error) {
            throw new Error(data.error);
        }

        // 🔥 valida token
        if (!data.token) {
            throw new Error("Login inválido");
        }

        // salvar sessão
        localStorage.setItem("token", data.token);
        localStorage.setItem("userId", data.user.id);

        // trocar tela
        document.getElementById("loginBox").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");

        // carregar dados
        await carregarSaldo();
        await carregarAds();

        alert("Login realizado!");

    } catch (err) {

        if (err.message.includes("Verifique seu email")) {

            alert("📩 Verifique seu email antes de fazer login");

            // 🔥 MOSTRA O BOTÃO
            const resendBox = document.getElementById("resendBox");
            if (resendBox) {
                resendBox.classList.remove("hidden");
            }

        } else {
            alert("Erro no login: " + err.message);
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

        document.getElementById("saldo").innerText = data.balance || 0;

    } catch (err) {
        alert(err.message);
    }
}

// ================= ESCAPE HTML =================
function escapeHTML(str) {
    if (!str) return "";

    return str.replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[m]));
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
                <span>👁 ${ad.views}</span>
                <span>🖱 ${ad.clicks}</span>
                <span>📊 ${ctr}%</span>
            </div>

            <div class="ad-extra">
                <span>💰 Bid: ${ad.bid}</span>
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
            console.log("Clique já registrado nesta sessão");
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
            console.log("Clique bloqueado por segurança");
            return;
        }

        // 🔥 tratamento de resposta
        if (data?.paused) {
            alert("⚠️ Anúncio pausado por saldo insuficiente");
        }

        // 🚨 erro da API
        if (data?.error) {
            console.error("Erro da API:", data.error);
        }

        const lastClick = localStorage.getItem(key);
        const now = Date.now();

        // ⏳ bloqueio de clique repetido (1 por minuto)
        if (lastClick && now - lastClick < 60000) {
            console.log("Aguarde antes de clicar novamente");
            return;
        }

        localStorage.setItem(key, now);

    } catch (err) {
        console.error("Erro ao registrar clique", err);
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
    try {
        const title = document.getElementById("title").value;
        const description = document.getElementById("description").value;
        const link = document.getElementById("link").value;
        const bid = parseMoney(document.getElementById("bid").value);

        if (!title || !link || isNaN(bid) || bid <= 0) {
            throw new Error("Preencha os campos corretamente");
        }

        if (bid < 1) {
            throw new Error("Valor mínimo do lance é R$ 1,00");
        }

        if (!description || description.length < 10) {
            throw new Error("Descrição muito curta");
        }

        // ✅ valida link antes
        try {
            new URL(link);
        } catch {
            throw new Error("Link inválido");
        }

        const res = await fetch(`${API}?action=createAd`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({ title, description, link, bid })
        });

        await safeJson(res);

        alert("Anúncio criado com sucesso 🚀");

        document.getElementById("title").value = "";
        document.getElementById("description").value = "";
        document.getElementById("link").value = "";
        document.getElementById("bid").value = "";
        document.getElementById("title").focus();

        await carregarAds();

    } catch (err) {
        alert(err.message);
    }
}

let loadingAds = false;

// ================= ADS =================
async function carregarAds() {

    if (loadingAds) return;
    loadingAds = true;

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
        alert(err.message);
    } finally {
        loadingAds = false;
    }
}

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
        alert(err.message);
    }
}

// ================= FORMATAÇÃO DE MOEDA =================
function formatarMoeda(input) {
    let value = input.value.replace(/\D/g, "");

    value = (value / 100).toFixed(2) + "";
    value = value.replace(".", ",");

    value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    input.value = "R$ " + value;
}

// ================= MÁSCARA DE MOEDA =================
const bidInput = document.getElementById("bid");

if (bidInput) {
    bidInput.addEventListener("input", (e) => {
        let v = e.target.value.replace(/\D/g, "");

        v = (Number(v) / 100).toFixed(2) + "";

        v = v.replace(".", ",");

        v = v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

        e.target.value = "R$ " + v;
    });
}

// ================= PARSE DE MOEDA =================
function parseMoney(value) {
    return Number(
        value.replace("R$ ", "")
            .replace(/\./g, "")
            .replace(",", ".")
    );
}

// ================= INICIALIZAÇÃO =================
async function init() {
    const token = getToken();

    // 🔒 se não estiver logado, não faz nada
    if (!token) {
        console.log("❌ Usuário não logado");
        return;
    }

    console.log("✅ Usuário autenticado");

    // esconder login (se existir)
    const loginBox = document.getElementById("loginBox");
    if (loginBox) loginBox.classList.add("hidden");

    // mostrar dashboard (se existir)
    const dashboard = document.getElementById("dashboard");
    if (dashboard) dashboard.classList.remove("hidden");

    try {
        await carregarSaldo();
        await carregarAds();
    } catch (err) {
        console.error("Erro ao iniciar:", err);
    }

    // 🔥 retorno de pagamento
    if (window.location.search.includes("success")) {
        alert("Pagamento aprovado!");
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
            alert(data.error);
            return;
        }

        // atualiza lista
        if (typeof carregarAds === "function") {
            carregarAds();
        } else if (typeof carregarAdsPublicos === "function") {
            carregarAdsPublicos();
        }

    } catch (err) {
        console.error(err);
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
document.addEventListener("DOMContentLoaded", init);
