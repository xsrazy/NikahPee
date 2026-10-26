const {
    loadDB, withDB, noSave, getAuth, verifyPassword, hashPassword,
    send, sendError, fail, readBody,
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
        const { old_password, new_password } = body;
        if (typeof new_password !== 'string' || new_password.length < 8) {
            return sendError(res, 400, 'Password baru minimal 8 karakter.');
        }
        if (!verifyPassword(old_password, db.settings.password)) {
            return sendError(res, 400, 'Password lama salah.');
        }
        const ok = await withDB(async (fresh) => {
            const innerAuth = getAuth(req, fresh);
            if (!innerAuth || !innerAuth.admin) {
                return noSave(false);
            }
            if (!verifyPassword(old_password, fresh.settings.password)) {
                return noSave(false);
            }
            fresh.settings.password = hashPassword(new_password);
            // Bump token_version: the password change revokes every
            // existing session, so the dashboard must re-login.
            fresh.settings.token_version = (fresh.settings.token_version ?? 0) + 1;
            return true;
        });
        if (!ok) {
            return sendError(res, 400, 'Password lama salah.');
        }
        return send(res, 200, { status: true });
    } catch (err) {
        return fail(res, err);
    }
};
