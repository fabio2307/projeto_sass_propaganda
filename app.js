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

        await safeJson(res);

        alert("Conta criada com sucesso!");

        showLogin();

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
    const container = document.getElementById("ads");

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
window.showRegister = showRegister;
window.showLogin = showLogin;
window.criarAd = criarAd;