import { criarAd, listarAds } from "./services/adsService";

async function init() {
    const { data } = await listarAds();
    console.log(data);
}

init();