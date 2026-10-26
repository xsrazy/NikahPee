const {
    loadDB, withDB, send, sendError, fail, httpError, readBody, rateLimit, clientIp,
    nameKey, newId, newEditToken, isName, isText, isStars, filterBadWords, publicReview,
    paginate,
} = require('./_lib');

module.exports = async (req, res) => {
    if (req.method === 'GET') {
        try {
            if (!rateLimit(`rev-read:${clientIp(req)}`, 120, 60 * 1000)) {
                return sendError(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
            }
            const db = await loadDB();
            const list = (db.reviews || [])
                .slice()
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(publicReview);
            return send(res, 200, paginate(list, req));
        } catch (err) {
            return fail(res, err);
        }
    }

    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        if (!rateLimit(`review:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak ulasan. Coba lagi nanti.');
        }
        const body = await readBody(req);
        const { name, stars, text, edit_token } = body;
        if (!isName(name)) {
            throw httpError(400, 'Nama wajib diisi (maks 100 karakter).');
        }
        if (edit_token !== undefined && typeof edit_token !== 'string') {
            throw httpError(400, 'Token edit tidak valid.');
        }
        if (!isStars(stars)) {
            throw httpError(400, 'Bintang harus 1-5.');
        }
        if (!isText(text, 500)) {
            throw httpError(400, 'Ulasan wajib diisi (maks 500 karakter).');
        }
        const cleanName = filterBadWords(name.trim());
        const cleanText = filterBadWords(String(text).trim());
        const ip = clientIp(req);
        const { review, created, issuedToken } = await withDB(async (db) => {
            // Platform-true rule: only buyers can review. The guest must
            // have an order under the same name (case-insensitive), the
            // order must not be cancelled (m8 fix), and the request must
            // carry the order's edit token (M1 fix; legacy orders without
            // one get one issued on first write).
            const order = (db.orders || []).find((o) => nameKey(o.name) === nameKey(cleanName));
            if (!order || order.presence === 'berhalangan') {
                const err = new Error('Buat pesanan dulu sebelum menulis ulasan.');
                err.status = 403;
                throw err;
            }
            let issued = null;
            if (order.edit_token) {
                if (edit_token !== order.edit_token) {
                    throw httpError(403, 'Token edit tidak cocok untuk pesanan ini.');
                }
            } else {
                issued = newEditToken();
                order.edit_token = issued;
            }
            const existing = (db.reviews || []).find((r) => nameKey(r.name) === nameKey(cleanName));
            if (existing) {
                existing.stars = stars;
                existing.text = cleanText;
                existing.ip = ip;
                // m8 fix: a reply answered the old text, so drop it.
                existing.reply = null;
                return { review: existing, created: false, issuedToken: issued };
            }
            const fresh = {
                id: newId(),
                name: cleanName,
                stars,
                text: cleanText,
                reply: null,
                created_at: new Date().toISOString(),
                ip,
            };
            db.reviews.push(fresh);
            return { review: fresh, created: true, issuedToken: issued };
        });
        const data = { ...publicReview(review) };
        if (issuedToken) {
            data.edit_token = issuedToken;
        }
        return send(res, created ? 201 : 200, data);
    } catch (err) {
        return fail(res, err);
    }
};
