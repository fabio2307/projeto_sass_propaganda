const API = "/api";

// ================= SAFE JSON =================
async function safeJson(res) {
    const text = await res.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("Erro inesperado");
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

function setToken(token) {
    localStorage.setItem("token", token);
}

function logout() {
    localStorage.clear();
    location.reload();
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
                email: document.getElementById("email").value,
                password: document.getElementById("password").value
            })
        });

        const data = await safeJson(res);

        if (!data.token) throw new Error("Erro ao cadastrar");

        setToken(data.token);

        console.log("TOKEN REGISTER:", data.token);

        await init();

    } catch (err) {
        alert(err.message);
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
                email: document.getElementById("email").value,
                password: document.getElementById("password").value
            })
        });

        const data = await safeJson(res);

        if (!data.token) throw new Error("Token não recebido");

        setToken(data.token);

        // 🔥 evita problema de sincronização
        await new Promise(r => setTimeout(r, 300));

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
}

// ================= SALDO =================
async function carregarSaldo() {
    try {
        const token = getToken();

        console.log("TOKEN ENVIADO:", token);

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
    const container = document.getElementById("adsList");

    if (!container) return;

    container.innerHTML = ads.map(ad => `
        <div>
            <strong>${ad.title}</strong><br>
            ${ad.description || ""}
        </div>
    `).join("");
}

function atualizarStats(ads) {
    console.log("Ads:", ads.length);
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
        const amount = Number(document.getElementById("amount").value);

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

// ================= EXPORT =================
window.login = login;
window.register = register;
window.pagar = pagar;
window.logout = logout;
window.init = init;
window.carregarAds = carregarAds;