const { loadDB, getAuth, send, sendError, fail, formatDate } = require('../_lib');

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
        const list = (db.follows || []).slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map((f) => ({ ip: f.ip, created_at: formatDate(f.created_at) }));
        return send(res, 200, list);
    } catch (err) {
        return fail(res, err);
    }
};
