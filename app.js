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

    if (!res.ok) {
        throw new Error(data.error || "Erro desconhecido");
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
    location.reload();
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
                age: Number(document.getElementById("registerAge").value),
                email: document.getElementById("registerEmail").value,
                password: document.getElementById("registerPassword").value
            })
        });

        const data = await safeJson(res);

        alert("Conta criada com sucesso!");
        showLogin();

    } catch (err) {
        console.error(err);
        alert("Erro: " + err.message);
    }
}

// ================= LOGIN =================
async function login() {
    try {
        const res = await fetch(`${API}?action=login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: document.getElementById("loginEmail").value,
                password: document.getElementById("loginPassword").value
            })
        });

        const data = await safeJson(res);

        setToken(data.token);

        await init();

    } catch (err) {
        alert(err.message);
    }
}

// ================= INIT =================
async function init() {
    const token = getToken();

    if (!token) {
        console.log("❌ Sem token");
        return;
    }

    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");

    await carregarSaldo();
    await carregarAds();

    if (window.location.search.includes("success")) {
        alert("Pagamento aprovado!");
        carregarSaldo();
        window.history.replaceState({}, document.title, "/");
    }
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

// ================= API =================
function renderAds(ads) {
    const container = document.getElementById("ads");

    if (!container) return;

    container.innerHTML = ads.map(ad => {
        const ctr = ad.views > 0
            ? ((ad.clicks / ad.views) * 100).toFixed(1)
            : 0;

        return `
        <div class="ad-card">
            <h3>${ad.title}</h3>
            <p>${ad.description || "Sem descrição"}</p>

            <a href="${ad.link}" target="_blank"
              onclick="registrarClick('${ad.id}')">
             🔗 Acessar produto
           </a>

            <div class="ad-metrics">
                <span>👁 ${ad.views}</span>
                <span>🖱 ${ad.clicks}</span>
                <span>📊 ${ctr}%</span>
            </div>

            <div class="ad-metrics">
                <span>💰 R$ ${ad.bid}</span>
                <span>⭐ ${ad.score || 0}</span>
                <span>📌 ${ad.status}</span>
            </div>
        </div>
        `;
    }).join("");
}

// ================= CLICK =================
async function registrarClick(adId) {
    try {
        await fetch(`${API}?action=click`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ adId })
        });
    } catch {
        console.error("Erro ao registrar clique");
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
        const bid = Number(document.getElementById("bid").value);

        if (!title || !link || isNaN(bid) || bid <= 0) {
            throw new Error("Preencha os campos corretamente");
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
        document.getElementById("valor").value = "";

        await carregarAds();

    } catch (err) {
        alert(err.message);
    }
}

// ================= ADS =================
async function carregarAds() {
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
    }
}

// ================= PAGAMENTO =================
async function pagar() {
    try {
        const amount = Number(document.getElementById("valor").value);

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

        window.location.href = data.url;

    } catch (err) {
        alert(err.message);
    }
}

// ================= TOGGLE AD =================
async function toggleAd(id, status) {
    try {
        await fetch(`${API}?action=toggleAd`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                id,
                status: status === "active" ? "paused" : "active"
            })
        });

        carregarAds();

    } catch {
        console.error("Erro ao alterar status do anúncio");
    }
}

// ================= EXPORT =================
window.login = login;
window.register = register;
window.pagar = pagar;
window.logout = logout;
window.init = init;
window.carregarAds = carregarAds;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.criarAd = criarAd;