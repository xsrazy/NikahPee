const {
    withDB, send, sendError, fail, httpError, readBody, rateLimit, clientIp,
    newId, isName, isText, filterBadWords, formatDate,
} = require('./_lib');

module.exports = async (req, res) => {
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
