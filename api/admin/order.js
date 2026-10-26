const {
    loadDB, withDB, noSave, getAuth, send, sendError, fail, readBody,
    nameKey,
} = require('../_lib');

module.exports = async (req, res) => {
    if (req.method !== 'DELETE') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        const db = await loadDB();
        const auth = getAuth(req, db);
        if (!auth || !auth.admin) {
            return sendError(res, 401, 'Unauthorized');
        }
        const body = await readBody(req).catch(() => ({}));
        const id = body.id || req.query.id;
        if (typeof id !== 'string' || !id) {
            return sendError(res, 400, 'ID wajib diisi.');
        }
        const deleted = await withDB(async (fresh) => {
            const innerAuth = getAuth(req, fresh);
            if (!innerAuth || !innerAuth.admin) {
                return noSave(false);
            }
            const idx = (fresh.orders || []).findIndex((o) => o.id === id);
            if (idx === -1) {
                return noSave(false);
            }
            const victim = fresh.orders[idx].name;
            fresh.orders.splice(idx, 1);
            // m7 fix: deleting an order also deletes its reviews, so a
            // review never survives without its order (and the rating
            // never counts a review whose order is gone).
            fresh.reviews = (fresh.reviews || []).filter((r) => nameKey(r.name) !== nameKey(victim));
            return true;
        });
        if (!deleted) {
            return sendError(res, 404, 'Pesanan tidak ditemukan.');
        }
        return send(res, 200, { status: true });
    } catch (err) {
        return fail(res, err);
    }
};
