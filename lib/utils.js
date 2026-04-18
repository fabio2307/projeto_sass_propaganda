// lib/utils.js

// 🔥 log de auditoria
function auditLog(action, userId, details) {
    // TODO: Implementar logging estruturado (Winston/Pino)
    // console.log(`AUDIT [${new Date().toISOString()}] ${action} - User: ${userId} - ${JSON.stringify(details)}`);
}

// 🔥 cache simples
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCache(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
        return item.data;
    }
    cache.delete(key);
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// 🔥 rate limit simples por IP
const clicks = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    if (!clicks.has(ip)) {
        clicks.set(ip, []);
    }
    const history = clicks.get(ip);
    const filtered = history.filter(t => now - t < 30000);
    if (filtered.length > 20) {
        filtered.shift();
    }
    clicks.set(ip, filtered);
    return filtered.length <= 5; // 5 cliques em 30s
}

export {
    auditLog,
    getCache,
    setCache,
    checkRateLimit
};