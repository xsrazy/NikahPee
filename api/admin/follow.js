const {
    loadDB, withDB, noSave, getAuth, send, sendError, fail, readBody,
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
        const ip = body.ip || req.query.ip;
        if (typeof ip !== 'string' || !ip) {
            return sendError(res, 400, 'IP wajib diisi.');
        }
        const deleted = await withDB(async (fresh) => {
            const innerAuth = getAuth(req, fresh);
            if (!innerAuth || !innerAuth.admin) {
                return noSave(false);
            }
            const idx = (fresh.follows || []).findIndex((f) => f.ip === ip);
            if (idx === -1) {
                return noSave(false);
            }
            fresh.follows.splice(idx, 1);
            return true;
        });
        if (!deleted) {
            return sendError(res, 404, 'Pengikut tidak ditemukan.');
        }
        return send(res, 200, { status: true });
    } catch (err) {
        return fail(res, err);
    }
};
