const {
    loadDB, withDB, noSave, getAuth, send, sendError, fail, readBody, rateLimit, clientIp,
    adminChat, paginate,
} = require('../_lib');

module.exports = async (req, res) => {
    // DELETE is ops-only (cleanup): the dashboard Chat view offers list
    // + reply, not delete, but test/ops data must be removable so the
    // store can return to an exact baseline.
    if (req.method === 'DELETE') {
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
                const idx = (fresh.chats || []).findIndex((c) => c.id === id);
                if (idx === -1) {
                    return noSave(false);
                }
                fresh.chats.splice(idx, 1);
                return true;
            });
            if (!deleted) {
                return sendError(res, 404, 'Chat tidak ditemukan.');
            }
            return send(res, 200, { status: true });
        } catch (err) {
            return fail(res, err);
        }
    }

    if (req.method !== 'GET') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        const db = await loadDB();
        const auth = getAuth(req, db);
        if (!auth || !auth.admin) {
            return sendError(res, 401, 'Unauthorized');
        }
        if (!rateLimit(`adm-chat:${clientIp(req)}`, 120, 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
        }
        const list = (db.chats || []).slice()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(adminChat);
        return send(res, 200, paginate(list, req));
    } catch (err) {
        return fail(res, err);
    }
};
