const API = window.location.origin + "/api";

// ================= LOGIN =================
async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.user && data.token) {
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("token", data.token);

        alert("Logado!");
        location.reload();
    } else {
        alert(data.error || "Erro no login");
    }
}

// ================= REGISTER =================
async function register() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.user) {
        alert("Conta criada!");
    } else {
        alert(data.error || "Erro no cadastro");
    }
}

// ================= LOGOUT =================
function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    location.reload();
}

// ================= CRIAR ANÚNCIO =================
async function criarAd() {

    const token = localStorage.getItem("token");

    if (!token) {
        alert("Faça login primeiro");
        return;
    }

    const ad = {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        link: document.getElementById("link").value,
        bid: Number(document.getElementById("bid").value)
    };

    const res = await fetch(`${API}/createAd`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(ad)
    });

    const data = await res.json();

    if (data.ok) {
        alert("Anúncio criado!");
        carregarAds();
    } else {
        alert(data.error || "Erro ao criar anúncio");
    }
}

// ================= CARREGAR ADS (CORRIGIDO) =================
async function carregarAds() {

    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    if (!token || !user) return;

    const res = await fetch(`${API}/getAds`, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    });

    const data = await res.json();

    const container = document.getElementById("ads");
    container.innerHTML = "";

    let totalClicks = 0;
    let totalViews = 0;

    if (!data.length) {
        container.innerHTML = "<p>Nenhum anúncio</p>";
        return;
    }

    // 🔥 FILTRO CORRIGIDO (ESSENCIAL)
    const meusAds = data.filter(ad => ad.user_id === user.id);

    meusAds.forEach(ad => {

        totalClicks += ad.clicks || 0;
        totalViews += ad.views || 0;

        const div = document.createElement("div");
        div.className = "ad-card";

        div.innerHTML = `
            <h3>${ad.title}</h3>
            <p>${ad.description || ""}</p>

            <a href="${ad.link}" target="_blank"
               onclick="registrarClique('${ad.id}')">
               🔗 Acessar produto
            </a>

            <div class="ad-metrics">
                <span>👁 ${ad.views || 0}</span>
                <span>🖱 ${ad.clicks || 0}</span>
                <span>💰 R$ ${ad.bid}</span>
            </div>
        `;

        container.appendChild(div);
    });

    // 🔥 ATUALIZA STATS
    document.getElementById("totalAds").innerText = meusAds.length;
    document.getElementById("totalClicks").innerText = totalClicks;
    document.getElementById("totalViews").innerText = totalViews;
}

// ================= CLIQUE =================
async function registrarClique(adId) {
    await fetch(`${API}/clickAd`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ ad_id: adId })
    });
}

// ================= AUTO LOGIN =================
if (localStorage.getItem("user")) {
    document.querySelector(".center-box").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    carregarAds();
}