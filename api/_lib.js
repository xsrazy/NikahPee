// Shared helpers for the NikahPee invitation API (Shopee-style).
// Database = one JSON document stored in a private Vercel Blob store.
// Infra pattern follows the proven Wedify/NikahTube/samaWA shape:
// versioned immutable docs, scrypt passwords, HS256 JWT with
// token-version revocation, optimistic-concurrency writes, LRU rate
// limits, last-XFF client IP. NikahPee has NO guest access key: guests
// act by name, admin acts by Bearer JWT only.
const crypto = require('crypto');

const BLOB_API = 'https://vercel.com/api/blob/';
const DB_PREFIX = 'np-';

const blobHeaders = () => ({
    authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
    'x-api-version': '11',
});

async function blobListVersions() {
    const res = await fetch(`${BLOB_API}?prefix=${DB_PREFIX}&limit=100`, {
        headers: blobHeaders(),
    });
    if (!res.ok) {
        throw new Error(`blob list failed: ${res.status}`);
    }
    const list = await res.json();
    return (list.blobs || [])
        .filter((b) => b.pathname.startsWith(DB_PREFIX))
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

// Editable shop texts (managed from the Seller Centre dashboard, served
// by GET /api/config). Prices are deliberately NOT editable: Rp0 is the
// joke and stays fixed.
const defaultShop = () => ({
    announcement: 'FLASH SALE 100%! Undangan pernikahan Usra & Zee GRATIS, ongkir GRATIS. Checkout sekarang!',
    description: [
        'Undangan Pernikahan Digital Usra & Zee.',
        '',
        'Akad Nikah: Senin, 17 Januari 2050, pukul 10.00 WIB.',
        'Resepsi: Senin, 17 Januari 2050, pukul 13.00 WIB.',
        'Tempat: Jam Gadang, Benteng Pasar Atas, Bukittinggi, Sumatera Barat.',
        '',
        'Rundown acara:',
        '10.00 WIB - Akad Nikah',
        '11.00 WIB - Ramah tamah',
        '13.00 WIB - Resepsi',
        '15.00 WIB - Penutup & foto bersama',
        '',
        'Cara pesan: pilih variasi kehadiran, atur jumlah tamu, lalu checkout. Satu pesanan per nama: pesan lagi dengan nama yang sama untuk mengubah pesananmu.',
        'Setelah checkout, kamu bisa menulis ulasan untuk toko ini.',
    ].join('\n'),
    specs: [
        'Mempelai Pria: Rahmatul Usra',
        'Mempelai Wanita: Azizi Asadel',
        'Tanggal: Senin, 17 Januari 2050',
        'Akad: 10.00 WIB',
        'Resepsi: 13.00 WIB',
        'Tempat: Jam Gadang, Bukittinggi',
        'Harga: Rp0 (Diskon 100%)',
        'Ongkir: Gratis',
        'Pengiriman: Undangan Digital',
    ].join('\n'),
});

const defaultDB = () => ({
    settings: {
        name: 'Usra',
        email: process.env.ADMIN_EMAIL || '',
        password: hashPassword(process.env.ADMIN_PASSWORD || ''),
        token_version: 0,
        shop: defaultShop(),
    },
    orders: [],
    reviews: [],
    chats: [],
    follows: [],
});

async function loadDBVersioned() {
    const versions = await blobListVersions();
    if (versions.length === 0) {
        return { db: defaultDB(), version: null, newestCorrupt: null };
    }
    const newestPathname = versions[0].pathname;
    let lastErr = null;
    for (const blob of versions.slice(0, 3)) {
        try {
            const res = await fetch(blob.url, {
                headers: { ...blobHeaders(), 'cache-control': 'no-cache' },
                cache: 'no-store',
            });
            if (!res.ok) {
                throw new Error(`blob get failed: ${res.status}`);
            }
            const db = JSON.parse(await res.text());
            if (!db.settings || typeof db.settings !== 'object') {
                throw new Error('db shape invalid');
            }
            for (const key of ['orders', 'reviews', 'chats', 'follows']) {
                if (!Array.isArray(db[key])) {
                    db[key] = [];
                }
            }
            if (!db.settings.shop || typeof db.settings.shop !== 'object') {
                db.settings.shop = defaultShop();
            } else {
                db.settings.shop = { ...defaultShop(), ...db.settings.shop };
            }
            return { db, version: blob.pathname, newestCorrupt: blob.pathname === newestPathname ? null : newestPathname };
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('db unreadable');
}

async function loadDB() {
    return (await loadDBVersioned()).db;
}

async function blobWriteVersion(text) {
    const pathname = `${DB_PREFIX}${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`;
    const res = await fetch(`${BLOB_API}?pathname=${encodeURIComponent(pathname)}`, {
        method: 'PUT',
        headers: {
            ...blobHeaders(),
            'x-vercel-blob-access': 'private',
            'x-content-type': 'application/json',
            'x-add-random-suffix': '0',
            'x-cache-control-max-age': '0',
        },
        body: text,
    });
    if (!res.ok) {
        throw new Error(`blob put failed: ${res.status}`);
    }
    return res.json();
}

async function blobDelete(urls) {
    if (urls.length === 0) {
        return;
    }
    try {
        const res = await fetch(`${BLOB_API}delete`, {
            method: 'POST',
            headers: { ...blobHeaders(), 'content-type': 'application/json' },
            body: JSON.stringify({ urls }),
        });
        if (!res.ok) {
            console.error(`blob delete failed: ${res.status}`);
        }
    } catch (err) {
        console.error(`blob delete failed: ${err.message}`);
    }
}

const saveDB = async (db) => {
    await blobWriteVersion(JSON.stringify(db));
    const versions = await blobListVersions().catch(() => []);
    if (versions.length > 2) {
        await blobDelete(versions.slice(2).map((b) => b.url));
    }
};

// Serialized read-modify-write with optimistic concurrency: the mutator
// runs against the newest version; if another writer saved meanwhile,
// the mutation is re-applied on the fresh version. Mutators must be
// re-runnable and return either their result or noSave(value).
async function withDB(mutator) {
    for (let attempt = 0; attempt < 6; attempt++) {
        const { db, version, newestCorrupt } = await loadDBVersioned();
        const result = await mutator(db);
        if (result && typeof result === 'object' && result.__noSave) {
            return result.value;
        }
        const now = await blobListVersions();
        const newest = now.length ? now[0].pathname : null;
        if (newestCorrupt) {
            if (newest !== newestCorrupt) {
                continue;
            }
            console.error(`blob newest version unreadable, superseding: ${newestCorrupt}`);
        } else if (newest !== version) {
            continue;
        }
        await saveDB(db);
        return result;
    }
    const err = new Error('Sedang sibuk, silakan coba lagi.');
    err.status = 409;
    throw err;
}

const noSave = (value) => ({ __noSave: true, value });

// ---------- passwords (scrypt only; fresh DB, no legacy hashes) ----------
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

const hashPassword = (password) => {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS);
    return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
};

const verifyPassword = (password, stored) => {
    const s = String(stored || '');
    try {
        if (!s.startsWith('scrypt:')) {
            return false;
        }
        const [, saltHex, hashHex] = s.split(':');
        const expected = Buffer.from(hashHex || '', 'hex');
        if (expected.length !== 64) {
            return false;
        }
        const check = crypto.scryptSync(String(password), Buffer.from(saltHex || '', 'hex'), 64, SCRYPT_PARAMS);
        return crypto.timingSafeEqual(expected, check);
    } catch {
        return false;
    }
};

// ---------- auth (admin Bearer JWT only; NO guest key) ----------
const authSecret = () => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error('AUTH_SECRET is not configured');
    }
    return secret;
};

const b64url = (input) =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const signToken = (payload) => {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', authSecret())
        .update(`${header}.${body}`).digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${header}.${body}.${sig}`;
};

const verifyToken = (token) => {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) {
        return null;
    }
    const [header, body, sig] = parts;
    try {
        const headerJson = JSON.parse(Buffer.from(header.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
        if (headerJson.alg !== 'HS256') {
            return null;
        }
    } catch {
        return null;
    }
    let expected;
    try {
        expected = crypto.createHmac('sha256', authSecret())
            .update(`${header}.${body}`).digest('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
        return null;
    }
    if (sig.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
    }
    try {
        const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
        if ((payload.exp ?? 0) < Date.now() / 1000) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
};

// Admin-only auth. A present-but-invalid Bearer token returns null
// (callers map it to 401); there is no guest fallback, so a dead session
// can never silently downgrade to guest behaviour.
const getAuth = (req, db) => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
        const payload = verifyToken(auth.slice(7));
        if (payload && (payload.tv ?? -1) === (db.settings.token_version ?? 0)) {
            return { admin: payload };
        }
        return null;
    }
    return null;
};

// ---------- http helpers ----------
const send = (res, code, data, httpStatus = code) => {
    res.status(httpStatus).json({ code, data, error: null });
};

const sendError = (res, code, message) => {
    res.status(code).json({ code, data: null, error: [message] });
};

const fail = (res, err) => {
    if (err && err.status) {
        return sendError(res, err.status, err.message);
    }
    console.error(err);
    return sendError(res, 500, 'Terjadi kesalahan pada server.');
};

const httpError = (status, message) => {
    const err = new Error(message);
    err.status = status;
    return err;
};

const readBody = async (req) => {
    // Vercel parses JSON bodies lazily: merely READING req.body throws
    // when the client sent malformed JSON with an application/json
    // content type. Guard the getter so that becomes a 400, not a 500.
    let body;
    try {
        body = req.body;
    } catch {
        throw httpError(400, 'Format data tidak valid.');
    }
    let parsed;
    if (body !== undefined && body !== null) {
        if (typeof body === 'string') {
            try {
                parsed = body ? JSON.parse(body) : {};
            } catch {
                throw httpError(400, 'Format data tidak valid.');
            }
        } else {
            parsed = body;
        }
    } else {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text) {
            return {};
        }
        try {
            parsed = JSON.parse(text);
        } catch {
            throw httpError(400, 'Format data tidak valid.');
        }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw httpError(400, 'Format data tidak valid.');
    }
    return parsed;
};

// Minimal in-memory rate limiting. Serverless instances are ephemeral,
// so this is a speed bump, not a hard guarantee. Eviction is LRU-style:
// never wipe the whole map (that would reset every counter).
const rateBuckets = new Map();
const rateLimit = (bucket, limit, windowMs) => {
    const now = Date.now();
    const key = String(bucket);
    let entry = rateBuckets.get(key);
    if (!entry || now - entry.start > windowMs) {
        entry = { start: now, count: 0 };
        rateBuckets.set(key, entry);
    }
    entry.count += 1;
    if (rateBuckets.size > 5000) {
        for (const k of rateBuckets.keys()) {
            rateBuckets.delete(k);
            if (rateBuckets.size <= 5000) {
                break;
            }
        }
    }
    return entry.count <= limit;
};

const rateReset = (bucket) => {
    rateBuckets.delete(String(bucket));
};

const clientIp = (req) => {
    // X-Forwarded-For is a chain: earlier entries are client-controlled.
    // Vercel's trusted edge appends the actual connecting IP last, so
    // only the last entry is trusted.
    const chain = String(req.headers['x-forwarded-for'] || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
    return chain.length ? chain[chain.length - 1] : 'unknown';
};

// ---------- dates / text ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const formatDate = (iso) => {
    const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}.${mm} WIB`;
};

const BAD_WORDS = ['anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'tolol', 'goblok',
    'jancok', 'asu', 'bajingan', 'kampret', 'fuck', 'shit', 'bitch', 'dick', 'pussy'];

const filterBadWords = (text) => {
    let out = String(text);
    for (const word of BAD_WORDS) {
        out = out.replace(new RegExp(`\\b${word}\\b`, 'gi'), '***');
    }
    return out;
};

// ---------- NikahPee domain ----------
const PRESENCE = ['datang', 'berhalangan', 'ragu'];
const PRESENCE_LABEL = { datang: 'Datang', berhalangan: 'Berhalangan', ragu: 'Masih Ragu' };
// Shopee order-status mapping for each RSVP variation.
const STATUS_LABEL = { datang: 'Dikonfirmasi', berhalangan: 'Dibatalkan', ragu: 'Belum Dibayar' };

const nameKey = (name) => String(name || '').trim().toLowerCase();

const newOrderNo = () =>
    `NP${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const newId = () => `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

// Strict validators: no silent coercion. Strings must be real strings,
// integers real JSON numbers, booleans real booleans.
const isName = (v) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 100;
const isText = (v, max) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max;
const isOptText = (v, max) => v === undefined || v === null || (typeof v === 'string' && v.length <= max);
const isQty = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99;
const isStars = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

const publicOrder = (o) => ({
    id: o.id,
    order_no: o.order_no,
    name: o.name,
    presence: o.presence,
    presence_label: PRESENCE_LABEL[o.presence] || o.presence,
    status_label: STATUS_LABEL[o.presence] || o.presence,
    qty: o.qty,
    message: o.message || '',
    gift: Boolean(o.gift),
    created_at: formatDate(o.created_at),
    updated_at: formatDate(o.updated_at),
});

const adminOrder = (o) => ({ ...publicOrder(o), ip: o.ip || 'unknown' });

const publicReview = (r) => ({
    id: r.id,
    name: r.name,
    stars: r.stars,
    text: r.text,
    reply: r.reply || null,
    created_at: formatDate(r.created_at),
});

const adminReview = (r) => ({ ...publicReview(r), ip: r.ip || 'unknown' });

const publicChat = (c) => ({
    id: c.id,
    name: c.name,
    text: c.text,
    reply: c.reply || null,
    created_at: formatDate(c.created_at),
});

const adminChat = (c) => ({ ...publicChat(c), ip: c.ip || 'unknown' });

module.exports = {
    loadDB, loadDBVersioned, saveDB, withDB, noSave,
    hashPassword, verifyPassword,
    signToken, verifyToken, getAuth,
    send, sendError, fail, httpError, readBody, rateLimit, rateReset, clientIp,
    formatDate, filterBadWords, defaultShop,
    PRESENCE, PRESENCE_LABEL, STATUS_LABEL, nameKey, newOrderNo, newId,
    isName, isText, isOptText, isQty, isStars,
    publicOrder, adminOrder, publicReview, adminReview, publicChat, adminChat,
};
