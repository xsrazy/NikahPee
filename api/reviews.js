const {
    loadDB, withDB, send, sendError, fail, httpError, readBody, rateLimit, clientIp,
    nameKey, newId, isName, isText, isStars, filterBadWords, publicReview,
} = require('./_lib');

module.exports = async (req, res) => {
    if (req.method === 'GET') {
        try {
            const db = await loadDB();
            const list = (db.reviews || [])
                .slice()
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(publicReview);
            return send(res, 200, list);
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
        const { name, stars, text } = body;
        if (!isName(name)) {
            throw httpError(400, 'Nama wajib diisi (maks 100 karakter).');
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
        const { review, created } = await withDB(async (db) => {
            // Platform-true rule: only buyers can review. The guest must
            // have an order under the same name (case-insensitive).
            const hasOrder = (db.orders || []).some((o) => nameKey(o.name) === nameKey(cleanName));
            if (!hasOrder) {
                const err = new Error('Buat pesanan dulu sebelum menulis ulasan.');
                err.status = 403;
                throw err;
            }
            const existing = (db.reviews || []).find((r) => nameKey(r.name) === nameKey(cleanName));
            if (existing) {
                existing.stars = stars;
                existing.text = cleanText;
                existing.ip = ip;
                return { review: existing, created: false };
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
            return { review: fresh, created: true };
        });
        return send(res, created ? 201 : 200, publicReview(review));
    } catch (err) {
        return fail(res, err);
    }
};
