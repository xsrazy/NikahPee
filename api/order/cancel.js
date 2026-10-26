const {
    loadDB, withDB, noSave, send, sendError, fail, readBody, rateLimit, clientIp,
    nameKey, isName, publicOrder,
} = require('../_lib');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        if (!rateLimit(`order-cancel:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak percobaan. Coba lagi nanti.');
        }
        const body = await readBody(req);
        if (!isName(body.name)) {
            return sendError(res, 400, 'Nama wajib diisi.');
        }
        const order = await withDB(async (db) => {
            const found = (db.orders || []).find((o) => nameKey(o.name) === nameKey(body.name));
            if (!found) {
                return noSave(null);
            }
            found.presence = 'berhalangan';
            found.updated_at = new Date().toISOString();
            return found;
        });
        if (!order) {
            return sendError(res, 404, 'Pesanan tidak ditemukan.');
        }
        return send(res, 200, publicOrder(order));
    } catch (err) {
        return fail(res, err);
    }
};
