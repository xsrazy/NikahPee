const { loadDB, send, sendError, fail } = require('./_lib');

const PRODUCT_TITLE = 'UNDANGAN PERNIKAHAN DIGITAL USRA & ZEE 17 JANUARI 2050 AKAD RESEPSI JAM GADANG BUKITTINGGI GRATIS';

const parseSpecs = (text) => String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
        const i = line.indexOf(':');
        if (i === -1) {
            return { k: line, v: '' };
        }
        return { k: line.slice(0, i).trim(), v: line.slice(i + 1).trim() };
    });

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return sendError(res, 405, 'Method not allowed');
    }
    try {
        const db = await loadDB();
        const shop = db.settings.shop || {};
        const orders = db.orders || [];
        const reviews = db.reviews || [];
        const ratingAvg = reviews.length
            ? Math.round((reviews.reduce((n, r) => n + r.stars, 0) / reviews.length) * 10) / 10
            : null;
        return send(res, 200, {
            shop: {
                name: 'Usra & Zee Official Store',
                username: 'usrazeeofficial',
                star_seller: true,
                announcement: shop.announcement || '',
                description: shop.description || '',
                specs: parseSpecs(shop.specs || ''),
            },
            product: {
                title: PRODUCT_TITLE,
                price: 0,
                price_before: 10000000,
                discount_percent: 100,
                free_shipping: true,
                images: [
                    '/assets/images/couple.webp',
                    '/assets/images/cewe.webp',
                    '/assets/images/cowo.webp',
                ],
                wedding_iso: '2050-01-17T10:00:00+07:00',
                date_label: 'Senin, 17 Januari 2050',
                akad_time: '10.00 WIB',
                resepsi_time: '13.00 WIB',
                venue_name: 'Jam Gadang',
                venue_address: 'Benteng Pasar Atas, Bukittinggi, Sumatera Barat',
                gift: [
                    { bank: 'SeaBank', number: '123456784848', owner: 'Rahmatul Usra' },
                    { bank: 'DANA', number: '081234561748', owner: 'Rahmatul Usra' },
                ],
            },
            stats: {
                followers: (db.follows || []).length,
                // "Terjual" counts confirmed (Datang) orders only: cancelled
                // and unpaid orders are not sales.
                sold: orders.filter((o) => o.presence === 'datang').length,
                order_count: orders.length,
                review_count: reviews.length,
                rating_avg: ratingAvg,
            },
        });
    } catch (err) {
        return fail(res, err);
    }
};
