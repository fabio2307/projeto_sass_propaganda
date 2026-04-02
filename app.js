const API = window.location.origin + "/api";

// LOGIN
async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        alert("Logado com sucesso!");
        location.reload();
    } else {
        alert(data.error || "Erro no login");
    }
}

// REGISTER
async function register() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API}/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.user) {
        alert("Conta criada!");
    } else {
        alert(data.error || "Erro no cadastro");
    }
}

// LOGOUT
function logout() {
    localStorage.removeItem("user");
    location.reload();
}

// CRIAR ANÚNCIO
async function criarAd() {
    const user = JSON.parse(localStorage.getItem("user"));

    const ad = {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        link: document.getElementById("link").value,
        bid: Number(document.getElementById("bid").value),
        user_id: user?.id
    };

    console.log("ENVIANDO AD:", ad);

    const res = await fetch("/api/createAd", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(ad)
    });

    const data = await res.json();

    console.log("RESPOSTA:", data);

    if (data.ok) {
        alert("Anúncio criado!");
        carregarAds();
    } else {
        alert(data.error);
    }
}

// CARREGAR ADS
async function carregarAds() {
    const user = JSON.parse(localStorage.getItem("user"));

    const res = await fetch(`/api/getAds?user_id=${user.id}`);

    const text = await res.text();
    console.log("ADS RAW:", text);

    let ads;

    try {
        ads = JSON.parse(text);
    } catch {
        alert("Erro na API");
        return;
    }

    const container = document.getElementById("ads");
    container.innerHTML = "";

    if (!Array.isArray(ads) || ads.length === 0) {
        container.innerHTML = "<p>Nenhum anúncio encontrado</p>";
        return;
    }

    aads.forEach(ad => {
        const div = document.createElement("div");
        div.className = "ad-card";

        div.innerHTML = `
    <h3>${ad.title}</h3>
    <p>${ad.description || ""}</p>
    <a href="${ad.link}" target="_blank">🔗 Acessar</a>

    <div class="ad-metrics">
        <span>👁 ${ad.views}</span>
        <span>🖱 ${ad.clicks}</span>
        <span>💰 ${ad.bid}</span>
    </div>
`;

        container.appendChild(div);
    });
}

// AUTO LOGIN
if (localStorage.getItem("user")) {
    document.querySelector(".center-box").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    carregarAds();
}