const { loadDB, getAuth, send, sendError, fail, rateLimit, clientIp, adminOrder, paginate } = require('../_lib');

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
        if (!rateLimit(`adm-orders:${clientIp(req)}`, 120, 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
        }
        const q = String(req.query.q || '').trim().toLowerCase();
        let list = (db.orders || []).slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (q) {
            list = list.filter((o) => o.name.toLowerCase().includes(q) || o.order_no.toLowerCase().includes(q));
        }
        return send(res, 200, paginate(list.map(adminOrder), req));
    } catch (err) {
        return fail(res, err);
    }
};
