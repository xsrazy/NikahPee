const { loadDB, getAuth, send, sendError, fail, rateLimit, clientIp, adminReview, paginate } = require('../_lib');

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
        if (!rateLimit(`adm-reviews:${clientIp(req)}`, 120, 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
        }
        const list = (db.reviews || []).slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(adminReview);
        return send(res, 200, paginate(list, req));
    } catch (err) {
        return fail(res, err);
    }
};
