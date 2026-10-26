const { loadDB, getAuth, send, sendError, fail, rateLimit, clientIp } = require('../_lib');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        const db = await loadDB();
        const auth = getAuth(req, db);
        if (!auth || !auth.admin) {
            return sendError(res, 401, 'Unauthorized');
        }
        if (!rateLimit(`adm-stats:${clientIp(req)}`, 120, 60 * 1000)) {
            return sendError(res, 429, 'Terlalu banyak permintaan. Coba lagi nanti.');
        }
        const orders = db.orders || [];
        const reviews = db.reviews || [];
        const byStatus = { datang: 0, berhalangan: 0, ragu: 0 };
        for (const o of orders) {
            if (byStatus[o.presence] !== undefined) {
                byStatus[o.presence] += 1;
            }
        }
        const totalGuests = orders
            .filter((o) => o.presence !== 'berhalangan')
            .reduce((n, o) => n + (o.qty || 0), 0);
        const ratingAvg = reviews.length
            ? Math.round((reviews.reduce((n, r) => n + r.stars, 0) / reviews.length) * 10) / 10
            : null;
        return send(res, 200, {
            orders_by_status: byStatus,
            order_count: orders.length,
            total_guests: totalGuests,
            review_count: reviews.length,
            rating_avg: ratingAvg,
            followers: (db.follows || []).length,
            chat_count: (db.chats || []).length,
        });
    } catch (err) {
        return fail(res, err);
    }
};
