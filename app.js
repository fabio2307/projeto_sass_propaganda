const API = "https://projeto-sass-propaganda.vercel.app/api";

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

        console.log("TOKEN SALVO:", getToken());

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
        console.log("TOKEN ENVIADO:", getToken());

        const res = await fetch(`${API}?action=getUser`, {
            headers: {
                Authorization: `Bearer ${getToken()}`
            }
        });

        const data = await safeJson(res);

        document.getElementById("saldo").innerText = data.balance || 0;

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

async function getUserFromToken(token) {
    if (!token) {
        console.log("❌ TOKEN VAZIO");
        return null;
    }

    console.log("🔍 BUSCANDO TOKEN:", token);

    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("token", token);

    console.log("📦 RESULTADO QUERY:", data);

    if (error) {
        console.error("❌ ERRO SUPABASE:", error);
        return null;
    }

    return data && data.length > 0 ? data[0] : null;
}

// ================= EXPORT =================
window.login = login;
window.pagar = pagar;
window.carregarAds = carregarAds;
window.logout = logout;
window.init = init;
window.getUserFromToken = getUserFromToken;