const {
    loadDB, withDB, send, sendError, fail, httpError, readBody, rateLimit, clientIp,
    PRESENCE, nameKey, newOrderNo, newId, newEditToken, isName, isOptText, isQty,
    filterBadWords, publicOrder,
} = require('../_lib');

module.exports = async (req, res) => {
    // Guest order lookup by name ("Pesanan Saya").
    if (req.method === 'GET') {
        try {
            if (!rateLimit(`ord-read:${clientIp(req)}`, 120, 60 * 1000)) {
                return sendError(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
            }
            const name = String(req.query.name || '').trim();
            if (!name) {
                return sendError(res, 400, 'Nama wajib diisi.');
            }
            const db = await loadDB();
            // Same filterBadWords normalization as POST (m1 fix): the
            // stored name is filtered, so lookups must filter too.
            const order = (db.orders || []).find((o) => nameKey(o.name) === nameKey(filterBadWords(name)));
            if (!order) {
                return sendError(res, 404, 'Pesanan tidak ditemukan.');
            }
            return send(res, 200, publicOrder(order));
        } catch (err) {
            return fail(res, err);
        }
    }

    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        if (!rateLimit(`order:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak pesanan. Coba lagi nanti.');
        }
        const body = await readBody(req);
        const { name, presence, qty, message, gift, edit_token } = body;
        if (!isName(name)) {
            throw httpError(400, 'Nama wajib diisi (maks 100 karakter).');
        }
        if (edit_token !== undefined && typeof edit_token !== 'string') {
            throw httpError(400, 'Token edit tidak valid.');
        }
        if (!PRESENCE.includes(presence)) {
            throw httpError(400, 'Variasi kehadiran tidak valid.');
        }
        if (!isQty(qty)) {
            throw httpError(400, 'Jumlah tamu harus angka 1-99.');
        }
        if (!isOptText(message, 500)) {
            throw httpError(400, 'Pesan maksimal 500 karakter.');
        }
        if (gift !== undefined && typeof gift !== 'boolean') {
            throw httpError(400, 'Tambah amplop tidak valid.');
        }
        const cleanName = filterBadWords(name.trim());
        const cleanMessage = message ? filterBadWords(String(message).trim()) : '';
        const ip = clientIp(req);
        const now = new Date().toISOString();
        const { order, created, issuedToken } = await withDB(async (db) => {
            const existing = (db.orders || []).find((o) => nameKey(o.name) === nameKey(cleanName));
            if (existing) {
                // M1 fix: updates require the order's edit token. Legacy
                // orders without a token get one issued on first write.
                let issued = null;
                if (existing.edit_token) {
                    if (edit_token !== existing.edit_token) {
                        throw httpError(403, 'Token edit tidak cocok untuk pesanan ini.');
                    }
                } else {
                    issued = newEditToken();
                    existing.edit_token = issued;
                }
                existing.presence = presence;
                existing.qty = qty;
                existing.message = cleanMessage;
                existing.gift = Boolean(gift);
                existing.updated_at = now;
                existing.ip = ip;
                return { order: existing, created: false, issuedToken: issued };
            }
            const fresh = {
                id: newId(),
                order_no: newOrderNo(),
                name: cleanName,
                presence,
                qty,
                message: cleanMessage,
                gift: Boolean(gift),
                edit_token: newEditToken(),
                created_at: now,
                updated_at: now,
                ip,
            };
            db.orders.push(fresh);
            return { order: fresh, created: true, issuedToken: fresh.edit_token };
        });
        const data = { ...publicOrder(order) };
        if (issuedToken) {
            data.edit_token = issuedToken;
        }
        return send(res, created ? 201 : 200, data);
    } catch (err) {
        return fail(res, err);
    }
};
