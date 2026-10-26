const {
    loadDB, withDB, noSave, send, sendError, fail, httpError, readBody, rateLimit, clientIp,
    nameKey, newEditToken, isName, filterBadWords, publicOrder,
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
        if (body.edit_token !== undefined && typeof body.edit_token !== 'string') {
            return sendError(res, 400, 'Token edit tidak valid.');
        }
        const cleanName = filterBadWords(body.name.trim());
        const { order, issuedToken } = await withDB(async (db) => {
            const found = (db.orders || []).find((o) => nameKey(o.name) === nameKey(cleanName));
            if (!found) {
                return noSave({ order: null, issuedToken: null });
            }
            // M1 fix: cancels require the order's edit token (legacy
            // orders without one get one issued on first write).
            let issued = null;
            if (found.edit_token) {
                if (body.edit_token !== found.edit_token) {
                    throw httpError(403, 'Token edit tidak cocok untuk pesanan ini.');
                }
            } else {
                issued = newEditToken();
                found.edit_token = issued;
            }
            found.presence = 'berhalangan';
            found.updated_at = new Date().toISOString();
            return { order: found, issuedToken: issued };
        });
        if (!order) {
            return sendError(res, 404, 'Pesanan tidak ditemukan.');
        }
        const data = { ...publicOrder(order) };
        if (issuedToken) {
            data.edit_token = issuedToken;
        }
        return send(res, 200, data);
    } catch (err) {
        return fail(res, err);
    }
};
