const clicks = new Map();

export function checkRateLimit(ip) {

    const now = Date.now();

    if (!clicks.has(ip)) {
        clicks.set(ip, []);
    }

    const history = clicks.get(ip);

    const filtered = history.filter(t => now - t < 30000);

    filtered.push(now);

    clicks.set(ip, filtered);

    return filtered.length <= 5; // max 5 cliques / 30s
}