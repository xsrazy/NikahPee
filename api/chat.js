const {
    loadDB, withDB, send, sendError, fail, httpError, readBody, rateLimit, clientIp,
    nameKey, newId, isName, isText, filterBadWords, formatDate, publicChat,
} = require('./_lib');

module.exports = async (req, res) => {
    // M2 fix: guests can read their own chat thread (with seller
    // replies). Only messages under the requested name are returned,
    // newest last, capped at 100.
    if (req.method === 'GET') {
        try {
            if (!rateLimit(`chat-read:${clientIp(req)}`, 120, 60 * 1000)) {
                return sendError(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
            }
            const name = String(req.query.name || '').trim();
            if (!name) {
                return sendError(res, 400, 'Nama wajib diisi.');
            }
            const db = await loadDB();
            const list = (db.chats || [])
                .filter((c) => nameKey(c.name) === nameKey(filterBadWords(name)))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .slice(-100)
                .map(publicChat);
            return send(res, 200, list);
        } catch (err) {
            return fail(res, err);
        }
    }

    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        if (!rateLimit(`chat:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak pesan. Coba lagi nanti.');
        }
        const body = await readBody(req);
        const { name, text } = body;
        if (!isName(name)) {
            throw httpError(400, 'Nama wajib diisi (maks 100 karakter).');
        }
        if (!isText(text, 500)) {
            throw httpError(400, 'Pesan wajib diisi (maks 500 karakter).');
        }
        const msg = await withDB(async (db) => {
            const fresh = {
                id: newId(),
                name: filterBadWords(name.trim()),
                text: filterBadWords(String(text).trim()),
                reply: null,
                created_at: new Date().toISOString(),
                ip: clientIp(req),
            };
            db.chats.push(fresh);
            return fresh;
        });
        return send(res, 201, { id: msg.id, created_at: formatDate(msg.created_at) });
    } catch (err) {
        return fail(res, err);
    }
};
