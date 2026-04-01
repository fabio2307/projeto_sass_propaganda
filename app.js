const API = window.location.origin + "/api";
// depois no Vercel vira automático

async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    console.log("ENVIANDO:", { email, password });

    const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
        const text = await res.text();
        console.error(text);
        alert("Erro no servidor");
        return;
    }

    const text = await res.text();
    console.log("RESPOSTA API:", text);

    let data;

    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error("Erro ao converter JSON:", text);
        alert("Erro no servidor (getAds)");
        return;
    }

    if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));

        document.querySelector(".center-box").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");

        carregarAds();
    } else {
        alert("Erro no login");
    }
}

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
        alert("Cadastro feito!");
    } else {
        alert("Erro no cadastro");
    }
}

function logout() {
    localStorage.removeItem("user");
    location.reload();
}

async function carregarAds() {
    const res = await fetch("/api/getAds");

    const text = await res.text();
    console.log("ADS RAW:", text);

    let ads;

    try {
        ads = JSON.parse(text);
    } catch {
        alert("Erro na API");
        return;
    }

    console.log("ADS PARSED:", ads); // 👈 IMPORTANTE

    if (!Array.isArray(ads)) {
        alert("Erro ao carregar anúncios");
        return;
    }

    const container = document.getElementById("ads");
    container.innerHTML = "";

    ads.forEach(ad => {
        const div = document.createElement("div");
        div.innerHTML = `
            <h3>${ad.title}</h3>
            <p>${ad.description || ""}</p>
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