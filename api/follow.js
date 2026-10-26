const {
    loadDB, withDB, send, sendError, fail, rateLimit, clientIp,
} = require('./_lib');

module.exports = async (req, res) => {
    if (req.method === 'GET') {
        try {
            const db = await loadDB();
            const following = (db.follows || []).some((f) => f.ip === clientIp(req));
            return send(res, 200, { following, followers: (db.follows || []).length });
        } catch (err) {
            return fail(res, err);
        }
    }

    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        if (!rateLimit(`follow:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak percobaan. Coba lagi nanti.');
        }
        const ip = clientIp(req);
        const result = await withDB(async (db) => {
            const idx = (db.follows || []).findIndex((f) => f.ip === ip);
            if (idx !== -1) {
                // Unfollow DELETES the record (same as Wedify follow).
                db.follows.splice(idx, 1);
                return { following: false, followers: db.follows.length };
            }
            db.follows.push({ ip, created_at: new Date().toISOString() });
            return { following: true, followers: db.follows.length };
        });
        return send(res, 200, result);
    } catch (err) {
        return fail(res, err);
    }
};
