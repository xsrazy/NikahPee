const { loadDB, getAuth, send, sendError, fail, rateLimit, clientIp, formatDate, paginate } = require('../_lib');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        const db = await loadDB();
        const auth = getAuth(req, db);
        if (!auth || !auth.admin) {
            return sendError(res, 401, 'Unauthorized');
        }
        if (!rateLimit(`adm-follows:${clientIp(req)}`, 120, 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
        }
        const list = (db.follows || []).slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map((f) => ({ ip: f.ip, created_at: formatDate(f.created_at) }));
        return send(res, 200, paginate(list, req));
    } catch (err) {
        return fail(res, err);
    }
};
