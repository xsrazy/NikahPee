const {
    loadDB, withDB, noSave, getAuth, send, sendError, fail, httpError, readBody,
    adminReview, adminChat,
} = require('../_lib');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        const db = await loadDB();
        const auth = getAuth(req, db);
        if (!auth || !auth.admin) {
            return sendError(res, 401, 'Unauthorized');
        }
        const body = await readBody(req);
        const { kind, id, reply } = body;
        if (kind !== 'review' && kind !== 'chat') {
            throw httpError(400, 'Jenis balasan tidak valid.');
        }
        if (typeof id !== 'string' || !id) {
            throw httpError(400, 'ID wajib diisi.');
        }
        if (typeof reply !== 'string' || reply.trim().length < 1 || reply.length > 500) {
            throw httpError(400, 'Balasan wajib diisi (maks 500 karakter).');
        }
        const updated = await withDB(async (fresh) => {
            const innerAuth = getAuth(req, fresh);
            if (!innerAuth || !innerAuth.admin) {
                return noSave(null);
            }
            const list = kind === 'review' ? fresh.reviews : fresh.chats;
            const item = (list || []).find((x) => x.id === id);
            if (!item) {
                return noSave(null);
            }
            item.reply = reply.trim();
            return item;
        });
        if (!updated) {
            return sendError(res, 404, 'Data tidak ditemukan.');
        }
        return send(res, 200, kind === 'review' ? adminReview(updated) : adminChat(updated));
    } catch (err) {
        return fail(res, err);
    }
};
