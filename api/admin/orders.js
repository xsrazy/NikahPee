const { loadDB, getAuth, send, sendError, fail, adminOrder } = require('../_lib');

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
        const q = String(req.query.q || '').trim().toLowerCase();
        let list = (db.orders || []).slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (q) {
            list = list.filter((o) => o.name.toLowerCase().includes(q) || o.order_no.toLowerCase().includes(q));
        }
        return send(res, 200, list.map(adminOrder));
    } catch (err) {
        return fail(res, err);
    }
};
