const {
    loadDB, withDB, noSave, getAuth, send, sendError, fail, httpError, readBody,
} = require('../_lib');

// Only shop texts are editable: announcement, description, specs.
// Prices are deliberately NOT editable (Rp0 is the joke and stays fixed),
// and images are not editable in v1.
const FIELDS = ['announcement', 'description', 'specs'];

module.exports = async (req, res) => {
    if (req.method !== 'PATCH') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        const db = await loadDB();
        const auth = getAuth(req, db);
        if (!auth || !auth.admin) {
            return sendError(res, 401, 'Unauthorized');
        }
        const body = await readBody(req);
        const patch = {};
        for (const f of FIELDS) {
            if (body[f] !== undefined) {
                if (typeof body[f] !== 'string' || body[f].length > 5000) {
                    throw httpError(400, `Kolom ${f} harus teks maksimal 5000 karakter.`);
                }
                patch[f] = body[f];
            }
        }
        const shop = await withDB(async (fresh) => {
            const innerAuth = getAuth(req, fresh);
            if (!innerAuth || !innerAuth.admin) {
                return noSave(null);
            }
            if (!fresh.settings.shop || typeof fresh.settings.shop !== 'object') {
                fresh.settings.shop = {};
            }
            Object.assign(fresh.settings.shop, patch);
            return fresh.settings.shop;
        });
        if (!shop) {
            return sendError(res, 401, 'Unauthorized');
        }
        // Return the stored shop texts so the dashboard re-fills from the
        // server instead of trusting its own input.
        return send(res, 200, {
            announcement: shop.announcement || '',
            description: shop.description || '',
            specs: shop.specs || '',
        });
    } catch (err) {
        return fail(res, err);
    }
};
