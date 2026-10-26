// NikahPee public page logic (Shopee-style product page).
(function () {
    'use strict';

    const $ = (s, el) => (el || document).querySelector(s);
    const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

    const PRESENCE_LABEL = { datang: 'Datang', berhalangan: 'Berhalangan', ragu: 'Masih Ragu' };
    const FALLBACK_ISO = '2050-01-17T10:00:00+07:00';
    const CART_KEY = 'nikahpee-cart';

    let cfg = null;
    let selectedPresence = 'datang';
    let qty = 1;
    let carouselIdx = 0;
    let carouselImgs = [];
    let rvStars = 5;
    let checkoutCtx = null; // {presence, qty, editName, draftIndex}
    let cancelArmedTimer = null;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    async function api(method, path, body) {
        const res = await fetch(path, {
            method,
            headers: { 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        let json = null;
        try { json = await res.json(); } catch (e) { /* non-JSON */ }
        if (!res.ok || !json || json.error) {
            const msg = (json && json.error && json.error[0]) || `Gagal (${res.status})`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return json.data;
    }

    let toastTimer = null;
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
    }

    function starsHTML(avg) {
        if (avg === null || avg === undefined) {
            return '<span class="stars">☆☆☆☆☆</span>';
        }
        const full = Math.round(avg);
        return '<span class="stars">' + '★'.repeat(full) + '☆'.repeat(5 - full) + '</span>';
    }

    // ---------- config + render ----------
    async function loadConfig() {
        cfg = await api('GET', '/api/config');
        const p = cfg.product;
        const s = cfg.shop;
        $('#productTitle').textContent = p.title;
        $('#descText').textContent = s.description;
        $('#announceText').textContent = s.announcement;
        const specTable = $('#specTable');
        specTable.innerHTML = s.specs.map((row) =>
            `<tr><td>${esc(row.k)}</td><td>${esc(row.v)}</td></tr>`).join('');
        const st = cfg.stats;
        $('#shopStars').innerHTML = starsHTML(st.rating_avg);
        $('#shopRatingText').textContent = st.rating_avg === null
            ? 'Belum ada penilaian'
            : `${st.rating_avg} dari ${st.review_count} ulasan`;
        $('#followerCount').textContent = st.followers;
        $('#prodStars').innerHTML = starsHTML(st.rating_avg);
        $('#reviewCountText').textContent = st.review_count === 0
            ? 'Belum ada ulasan' : `${st.review_count} Ulasan`;
        $('#soldText').textContent = `Terjual ${st.sold}`;
        carouselImgs = p.images;
        renderCarousel();
        renderGiftCards();
        startCountdown(p.wedding_iso);
    }

    function renderGiftCards() {
        const wrap = $('#giftCards');
        wrap.innerHTML = cfg.product.gift.map((g) =>
            `<div class="gift-card"><p><strong>${esc(g.bank)}</strong><br>${esc(g.number)}<br>a.n. ${esc(g.owner)}</p>` +
            `<button type="button" class="btn btn-outline copy-btn" data-copy="${esc(g.number)}">Salin</button></div>`).join('');
        $$('.copy-btn', wrap).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
            ta.remove();
        }
        toast('Nomor disalin');
    }

    // ---------- carousel ----------
    function renderCarousel() {
        const thumbs = $('#thumbs');
        thumbs.innerHTML = carouselImgs.map((src, i) =>
            `<img src="${esc(src)}" alt="Foto produk ${i + 1}" class="${i === carouselIdx ? 'active' : ''}" data-i="${i}">`).join('');
        $$('img', thumbs).forEach((img) => img.addEventListener('click', () => {
            carouselIdx = Number(img.dataset.i);
            showCarousel();
        }));
        showCarousel();
    }
    function showCarousel() {
        $('#mainImg').src = carouselImgs[carouselIdx];
        $$('#thumbs img').forEach((img, i) => img.classList.toggle('active', i === carouselIdx));
    }
    $('#prevImg').addEventListener('click', () => {
        carouselIdx = (carouselIdx - 1 + carouselImgs.length) % carouselImgs.length;
        showCarousel();
    });
    $('#nextImg').addEventListener('click', () => {
        carouselIdx = (carouselIdx + 1) % carouselImgs.length;
        showCarousel();
    });

    // ---------- countdown (flash sale timer) ----------
    let countdownTimer = null;
    function startCountdown(iso) {
        let target = new Date(iso);
        if (isNaN(target.getTime())) {
            target = new Date(FALLBACK_ISO);
        }
        const el = $('#flashTimer');
        const tick = () => {
            const diff = target.getTime() - Date.now();
            if (diff <= 0) {
                el.textContent = 'Flash Sale berakhir';
                return;
            }
            const days = Math.floor(diff / 86400000);
            const h = String(Math.floor(diff / 3600000) % 24).padStart(2, '0');
            const m = String(Math.floor(diff / 60000) % 60).padStart(2, '0');
            const s = String(Math.floor(diff / 1000) % 60).padStart(2, '0');
            el.textContent = `${days} hari ${h}:${m}:${s}`;
        };
        tick();
        clearInterval(countdownTimer);
        countdownTimer = setInterval(tick, 1000);
    }

    // ---------- variation + qty ----------
    function syncVariationUI() {
        $$('#variationRow .var-btn').forEach((b) =>
            b.classList.toggle('selected', b.dataset.presence === selectedPresence));
    }
    $$('#variationRow .var-btn').forEach((b) => b.addEventListener('click', () => {
        selectedPresence = b.dataset.presence;
        syncVariationUI();
    }));
    syncVariationUI();

    function syncQtyUI() { $('#qtyVal').textContent = qty; }
    $('#qtyMinus').addEventListener('click', () => { if (qty > 1) { qty -= 1; syncQtyUI(); } });
    $('#qtyPlus').addEventListener('click', () => { if (qty < 99) { qty += 1; syncQtyUI(); } });

    // ---------- cart (drafts in localStorage) ----------
    function getCart() {
        try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; }
    }
    function setCart(items) {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
        syncCartBadge();
    }
    function syncCartBadge() {
        const n = getCart().length;
        const badge = $('#cartCount');
        badge.textContent = n;
        badge.hidden = n === 0;
    }
    syncCartBadge();

    function renderCart() {
        const items = getCart();
        const wrap = $('#cartItems');
        $('#cartEmpty').hidden = items.length !== 0;
        wrap.innerHTML = items.map((d, i) =>
            `<div class="cart-item"><p><strong>${esc(PRESENCE_LABEL[d.presence])}</strong> &times; ${d.qty} tamu<br>Total: Rp0</p>` +
            `<span><button type="button" class="btn btn-outline" data-checkout="${i}">Checkout</button> ` +
            `<button type="button" class="btn btn-outline" data-del="${i}">Hapus</button></span></div>`).join('');
        $$('[data-checkout]', wrap).forEach((b) => b.addEventListener('click', () => {
            const d = getCart()[Number(b.dataset.checkout)];
            if (d) { openCheckout(d.presence, d.qty, null, Number(b.dataset.checkout)); }
        }));
        $$('[data-del]', wrap).forEach((b) => b.addEventListener('click', () => {
            const items2 = getCart();
            items2.splice(Number(b.dataset.del), 1);
            setCart(items2);
            renderCart();
        }));
    }

    function openPanel(id) { $(id).hidden = false; }
    function closePanel(id) { $(id).hidden = true; }

    $('#cartBtn').addEventListener('click', () => { renderCart(); openPanel('#cartDrawer'); });
    $('#cartClose').addEventListener('click', () => closePanel('#cartDrawer'));
    $('#chatBtn').addEventListener('click', () => openPanel('#chatPanel'));
    $('#chatBtn2').addEventListener('click', () => openPanel('#chatPanel'));
    $('#chatClose').addEventListener('click', () => closePanel('#chatPanel'));
    // Backdrop click + Escape close any open panel (standard modal behavior).
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('panel')) closePanel('#' + e.target.id);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') $$('.panel').forEach((p) => { p.hidden = true; });
    });
    $('#bellBtn').addEventListener('click', () => {
        const pop = $('#announcePop');
        pop.hidden = !pop.hidden;
    });
    $('#searchForm').addEventListener('submit', (e) => {
        e.preventDefault();
        document.getElementById('product').scrollIntoView({ behavior: 'smooth' });
        toast(`Menampilkan produk untuk "${$('#searchInput').value.trim() || 'usra zee'}"`);
    });

    $('#addCartBtn').addEventListener('click', () => {
        const items = getCart();
        items.push({ presence: selectedPresence, qty, added_at: new Date().toISOString() });
        setCart(items);
        toast('Ditambahkan ke keranjang');
    });
    $('#buyNowBtn').addEventListener('click', () => openCheckout(selectedPresence, qty, null, null));

    // ---------- checkout ----------
    function openCheckout(presence, q, editName, draftIndex) {
        checkoutCtx = { presence, qty: q, editName: editName || null, draftIndex };
        $('#coFormView').hidden = false;
        $('#coSuccessView').hidden = true;
        $('#coError').hidden = true;
        $('#coSummary').textContent =
            `Variasi: ${PRESENCE_LABEL[presence]} • Jumlah: ${q} tamu • Total: Rp0` +
            (editName ? ' • Mengubah pesanan' : '');
        const nameInput = $('#coName');
        nameInput.value = editName || '';
        nameInput.disabled = Boolean(editName);
        $('#coMessage').value = '';
        $('#coGift').checked = false;
        $('#giftCards').hidden = true;
        if (editName) {
            // Prefill message/gift from the existing order when editing.
            api('GET', `/api/order?name=${encodeURIComponent(editName)}`).then((o) => {
                $('#coMessage').value = o.message || '';
                $('#coGift').checked = Boolean(o.gift);
                $('#giftCards').hidden = !o.gift;
            }).catch(() => { /* keep blank */ });
        }
        openPanel('#checkoutModal');
    }
    $('#coClose').addEventListener('click', () => closePanel('#checkoutModal'));
    $('#coGift').addEventListener('change', (e) => {
        $('#giftCards').hidden = !e.target.checked;
    });

    $('#checkoutForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = $('#coError');
        errEl.hidden = true;
        const name = $('#coName').value.trim();
        if (!name) {
            errEl.textContent = 'Nama Penerima wajib diisi.';
            errEl.hidden = false;
            return;
        }
        const btn = e.submitter;
        if (btn) btn.disabled = true;
        try {
            const order = await api('POST', '/api/order', {
                name,
                presence: checkoutCtx.presence,
                qty: checkoutCtx.qty,
                message: $('#coMessage').value.trim(),
                gift: $('#coGift').checked,
            });
            if (checkoutCtx.draftIndex !== null && checkoutCtx.draftIndex !== undefined) {
                const items = getCart();
                items.splice(checkoutCtx.draftIndex, 1);
                setCart(items);
            }
            $('#coOrderNo').textContent = order.order_no;
            $('#coTracking').innerHTML = trackingHTML(order.presence);
            $('#coFormView').hidden = true;
            $('#coSuccessView').hidden = false;
            $('#coViewOrder').onclick = () => {
                closePanel('#checkoutModal');
                $('#lookupName').value = name;
                document.getElementById('myOrderSection').scrollIntoView({ behavior: 'smooth' });
                doLookup(name);
            };
            $('#coWriteReview').onclick = () => {
                closePanel('#checkoutModal');
                $('#rvName').value = name;
                document.getElementById('reviewSection').scrollIntoView({ behavior: 'smooth' });
            };
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    function trackingHTML(presence) {
        if (presence === 'berhalangan') {
            return '<p><span class="badge-status cancelled">Dibatalkan</span> Pesanan ini dibatalkan.</p>';
        }
        const steps = presence === 'datang'
            ? [['done', '✓', 'Pesanan Diterima'], ['done', '✓', 'Undangan Dikirim'], ['', '○', 'Sampai Jumpa di Hari H']]
            : [['done', '✓', 'Pesanan Diterima'], ['', '○', 'Undangan Dikirim'], ['', '○', 'Sampai Jumpa di Hari H']];
        return '<div class="tracking">' + steps.map(([cls, dot, label]) =>
            `<div class="track-step ${cls}"><span class="dot">${dot}</span>${label}</div>`).join('') + '</div>';
    }

    // ---------- follow ----------
    async function loadFollow() {
        try {
            const data = await api('GET', '/api/follow');
            $('#followBtn').textContent = data.following ? '✓ Mengikuti' : '+ Ikuti';
            $('#followerCount').textContent = data.followers;
        } catch (e) { /* follow state is best-effort */ }
    }
    $('#followBtn').addEventListener('click', async () => {
        try {
            const data = await api('POST', '/api/follow');
            $('#followBtn').textContent = data.following ? '✓ Mengikuti' : '+ Ikuti';
            $('#followerCount').textContent = data.followers;
            toast(data.following ? 'Mengikuti toko ini' : 'Berhenti mengikuti toko ini');
        } catch (err) {
            toast(err.message);
        }
    });

    // ---------- reviews ----------
    function renderStarsInput() {
        $$('#reviewForm .stars-input button').forEach((b) =>
            b.classList.toggle('lit', Number(b.dataset.stars) <= rvStars));
    }
    $$('#reviewForm .stars-input button').forEach((b) => b.addEventListener('click', () => {
        rvStars = Number(b.dataset.stars);
        renderStarsInput();
    }));
    renderStarsInput();

    async function loadReviews() {
        try {
            const list = await api('GET', '/api/reviews');
            const wrap = $('#reviewList');
            $('#reviewEmpty').hidden = list.length !== 0;
            wrap.innerHTML = list.map((r) =>
                `<article class="review-item"><span class="who">${esc(r.name)}</span>` +
                `<span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>` +
                `<span class="when">${esc(r.created_at)}</span><p>${esc(r.text)}</p>` +
                (r.reply ? `<div class="seller-reply"><strong>Balasan Penjual:</strong> ${esc(r.reply)}</div>` : '') +
                `</article>`).join('');
            // Summary + distribution.
            const counts = [0, 0, 0, 0, 0];
            list.forEach((r) => { counts[r.stars - 1] += 1; });
            const avg = list.length
                ? (list.reduce((n, r) => n + r.stars, 0) / list.length).toFixed(1) : null;
            let sum = `<p><strong>${avg === null ? 'Belum ada penilaian' : `${avg} / 5 dari ${list.length} ulasan`}</strong></p>`;
            for (let s = 5; s >= 1; s--) {
                const c = counts[s - 1];
                const pct = list.length ? Math.round((c / list.length) * 100) : 0;
                sum += `<div class="dist-row"><span>${s}★</span><div class="dist-bar"><i style="width:${pct}%"></i></div><span>${c}</span></div>`;
            }
            $('#reviewSummary').innerHTML = sum;
        } catch (e) { /* reviews are best-effort on load */ }
    }

    $('#reviewForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = $('#rvError');
        errEl.innerHTML = '';
        errEl.hidden = true;
        const name = $('#rvName').value.trim();
        const text = $('#rvText').value.trim();
        if (!name || !text) {
            errEl.textContent = 'Nama dan ulasan wajib diisi.';
            errEl.hidden = false;
            return;
        }
        const btn = e.submitter;
        if (btn) btn.disabled = true;
        try {
            await api('POST', '/api/reviews', { name, stars: rvStars, text });
            $('#rvText').value = '';
            toast('Ulasan terkirim, terima kasih!');
            await loadReviews();
            await loadConfig();
        } catch (err) {
            errEl.textContent = err.message;
            if (err.status === 403) {
                const go = document.createElement('button');
                go.type = 'button';
                go.className = 'btn btn-primary';
                go.textContent = 'Checkout Sekarang';
                go.style.marginTop = '8px';
                go.addEventListener('click', () => {
                    document.getElementById('product').scrollIntoView({ behavior: 'smooth' });
                });
                errEl.appendChild(document.createElement('br'));
                errEl.appendChild(go);
            }
            errEl.hidden = false;
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // ---------- Pesanan Saya ----------
    async function doLookup(name) {
        const errEl = $('#lookupError');
        errEl.hidden = true;
        $('#lookupResult').innerHTML = '';
        try {
            const o = await api('GET', `/api/order?name=${encodeURIComponent(name)}`);
            const card = document.createElement('div');
            card.className = 'order-card';
            const statusCls = o.presence === 'datang' ? '' : (o.presence === 'ragu' ? 'pending' : 'cancelled');
            card.innerHTML =
                `<h3>Pesanan ${esc(o.order_no)}</h3>` +
                `<p>Nama: <strong>${esc(o.name)}</strong></p>` +
                `<p>Kehadiran: <strong>${esc(o.presence_label)}</strong> ` +
                `<span class="badge-status ${statusCls}">${esc(o.status_label)}</span></p>` +
                `<p>Jumlah: <strong>${o.qty} tamu</strong></p>` +
                (o.message ? `<p>Pesan: ${esc(o.message)}</p>` : '') +
                (o.gift ? '<p>🎁 Amplop Digital: Ya</p>' : '') +
                `<p>Dibuat: ${esc(o.created_at)}</p>` +
                trackingHTML(o.presence) +
                `<div class="buy-actions">` +
                `<button type="button" class="btn btn-outline" id="editBtn">Ubah Pesanan</button> ` +
                `<button type="button" class="btn btn-outline btn-danger" id="cancelBtn">Batalkan Pesanan</button></div>`;
            $('#lookupResult').appendChild(card);
            $('#editBtn').addEventListener('click', () => {
                selectedPresence = o.presence;
                qty = o.qty;
                syncVariationUI();
                syncQtyUI();
                openCheckout(o.presence, o.qty, o.name, null);
            });
            const cancelBtn = $('#cancelBtn');
            cancelBtn.addEventListener('click', async () => {
                if (cancelBtn.dataset.armed !== '1') {
                    cancelBtn.dataset.armed = '1';
                    cancelBtn.textContent = 'Yakin batalkan? Klik lagi';
                    clearTimeout(cancelArmedTimer);
                    cancelArmedTimer = setTimeout(() => {
                        cancelBtn.dataset.armed = '';
                        cancelBtn.textContent = 'Batalkan Pesanan';
                    }, 4000);
                    return;
                }
                cancelBtn.disabled = true;
                try {
                    await api('POST', '/api/order/cancel', { name: o.name });
                    toast('Pesanan dibatalkan');
                    await doLookup(o.name);
                } catch (err) {
                    toast(err.message);
                    cancelBtn.disabled = false;
                }
            });
        } catch (err) {
            errEl.textContent = err.message;
            errEl.hidden = false;
        }
    }
    $('#lookupForm').addEventListener('submit', (e) => {
        e.preventDefault();
        doLookup($('#lookupName').value.trim());
    });

    // ---------- chat ----------
    $('#chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('#chatName').value.trim();
        const text = $('#chatText').value.trim();
        if (!name || !text) {
            toast('Nama dan pesan wajib diisi.');
            return;
        }
        const btn = e.submitter;
        if (btn) btn.disabled = true;
        try {
            await api('POST', '/api/chat', { name, text });
            $('#chatText').value = '';
            toast('Pesan terkirim ke penjual');
            closePanel('#chatPanel');
        } catch (err) {
            toast(err.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // ---------- boot ----------
    (async () => {
        try {
            await loadConfig();
        } catch (e) {
            $('#productTitle').textContent = 'Gagal memuat produk. Coba refresh halaman.';
            toast('Gagal memuat toko, coba refresh.');
            return;
        }
        loadFollow();
        loadReviews();
    })();
})();
