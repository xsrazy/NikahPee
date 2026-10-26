// NikahPee Seller Centre dashboard logic.
(function () {
    'use strict';

    const $ = (s, el) => (el || document).querySelector(s);
    const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
    const TOKEN_KEY = 'nikahpee-admin-token';

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const getToken = () => localStorage.getItem(TOKEN_KEY);
    const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
    const clearToken = () => localStorage.removeItem(TOKEN_KEY);

    let toastTimer = null;
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
    }

    function showLogin() {
        $('#loginPanel').hidden = false;
        $('#logoutBtn').hidden = true;
    }
    function hideLogin() {
        $('#loginPanel').hidden = true;
        $('#logoutBtn').hidden = false;
    }

    async function apiAdmin(method, path, body) {
        const res = await fetch(path, {
            method,
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${getToken() || ''}`,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        let json = null;
        try { json = await res.json(); } catch (e) { /* non-JSON */ }
        if (res.status === 401) {
            clearToken();
            showLogin();
            throw new Error('Sesi berakhir, silakan login ulang.');
        }
        if (!res.ok || !json || json.error) {
            const msg = (json && json.error && json.error[0]) || `Gagal (${res.status})`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return json.data;
    }

    async function apiPublic(method, path, body) {
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

    // ---------- nav ----------
    function switchView(name) {
        $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
        $$('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
        if (name === 'orders') { loadOrders(); }
        if (name === 'reviews') { loadReviewsAdmin(); }
        if (name === 'chat') { loadChatAdmin(); }
        if (name === 'product') { loadProductForm(); }
        if (name === 'stats') { loadStats(); }
    }
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));

    // Two-step inline confirm: first click arms ("Yakin?"), second acts.
    function armable(btn, label, action) {
        btn.addEventListener('click', async () => {
            if (btn.dataset.armed !== '1') {
                btn.dataset.armed = '1';
                btn.textContent = 'Yakin? Klik lagi';
                setTimeout(() => {
                    btn.dataset.armed = '';
                    btn.textContent = label;
                }, 4000);
                return;
            }
            if (btn) btn.disabled = true;
            try { await action(); } finally { btn.disabled = false; }
        });
    }

    function statusBadge(o) {
        const cls = o.presence === 'datang' ? '' : (o.presence === 'ragu' ? 'pending' : 'cancelled');
        return `<span class="badge-status ${cls}">${esc(o.status_label)}</span>`;
    }

    // ---------- orders ----------
    async function loadOrders() {
        const q = $('#orderSearch').value.trim();
        try {
            const list = await apiAdmin('GET', `/api/admin/orders${q ? `?q=${encodeURIComponent(q)}` : ''}`);
            const wrap = $('#orderList');
            $('#orderEmpty').hidden = list.length !== 0;
            wrap.innerHTML = '';
            list.forEach((o) => {
                const card = document.createElement('div');
                card.className = 'item-card';
                card.innerHTML =
                    `<h3>${esc(o.order_no)} — ${esc(o.name)}</h3>` +
                    `<p>${esc(o.presence_label)} ${statusBadge(o)} • ${o.qty} tamu${o.gift ? ' • 🎁 Amplop Digital' : ''}</p>` +
                    (o.message ? `<p>Pesan: ${esc(o.message)}</p>` : '') +
                    `<p class="meta">IP: ${esc(o.ip)} • Dibuat: ${esc(o.created_at)}</p>` +
                    `<div class="row-actions"><button type="button" class="btn btn-danger">Hapus Pesanan</button></div>`;
                const delBtn = $('button', card);
                armable(delBtn, 'Hapus Pesanan', async () => {
                    await apiAdmin('DELETE', '/api/admin/order', { id: o.id });
                    toast('Pesanan dihapus');
                    loadOrders();
                });
                wrap.appendChild(card);
            });
        } catch (err) {
            if (err.message !== 'Sesi berakhir, silakan login ulang.') {
                toast(err.message);
            }
        }
    }
    $('#orderSearchForm').addEventListener('submit', (e) => {
        e.preventDefault();
        loadOrders();
    });

    // ---------- reviews + chat (shared reply UI) ----------
    function replyBlock(kind, item, reload) {
        const box = document.createElement('div');
        if (item.reply) {
            box.innerHTML = `<div class="seller-reply"><strong>Balasan Penjual:</strong> ${esc(item.reply)}</div>`;
        }
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn btn-outline';
        toggle.textContent = item.reply ? 'Ubah Balasan' : 'Balas';
        const form = document.createElement('div');
        form.className = 'reply-form';
        form.hidden = true;
        form.innerHTML = `<textarea rows="2" maxlength="500" placeholder="Tulis balasan...">${esc(item.reply || '')}</textarea>` +
            '<button type="button" class="btn btn-primary">Kirim Balasan</button>';
        toggle.addEventListener('click', () => { form.hidden = !form.hidden; });
        $('button', form).addEventListener('click', async () => {
            const reply = $('textarea', form).value.trim();
            if (!reply) {
                toast('Balasan wajib diisi.');
                return;
            }
            try {
                await apiAdmin('POST', '/api/admin/reply', { kind, id: item.id, reply });
                toast('Balasan terkirim');
                reload();
            } catch (err) {
                toast(err.message);
            }
        });
        const actions = document.createElement('div');
        actions.className = 'row-actions';
        actions.appendChild(toggle);
        box.appendChild(actions);
        box.appendChild(form);
        return box;
    }

    async function loadReviewsAdmin() {
        try {
            const list = await apiAdmin('GET', '/api/admin/reviews');
            const wrap = $('#reviewListAdmin');
            $('#reviewEmptyAdmin').hidden = list.length !== 0;
            wrap.innerHTML = '';
            list.forEach((r) => {
                const card = document.createElement('div');
                card.className = 'item-card';
                card.innerHTML =
                    `<h3>${esc(r.name)} <span class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span></h3>` +
                    `<p>${esc(r.text)}</p>` +
                    `<p class="meta">IP: ${esc(r.ip)} • ${esc(r.created_at)}</p>`;
                card.appendChild(replyBlock('review', r, loadReviewsAdmin));
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'btn btn-danger';
                del.textContent = 'Hapus Ulasan';
                const actions = document.createElement('div');
                actions.className = 'row-actions';
                actions.appendChild(del);
                card.appendChild(actions);
                armable(del, 'Hapus Ulasan', async () => {
                    await apiAdmin('DELETE', '/api/admin/review', { id: r.id });
                    toast('Ulasan dihapus');
                    loadReviewsAdmin();
                });
                wrap.appendChild(card);
            });
        } catch (err) {
            if (err.message !== 'Sesi berakhir, silakan login ulang.') {
                toast(err.message);
            }
        }
    }

    async function loadChatAdmin() {
        try {
            const list = await apiAdmin('GET', '/api/admin/chat');
            const wrap = $('#chatListAdmin');
            $('#chatEmptyAdmin').hidden = list.length !== 0;
            wrap.innerHTML = '';
            list.forEach((c) => {
                const card = document.createElement('div');
                card.className = 'item-card';
                card.innerHTML =
                    `<h3>${esc(c.name)}</h3><p>${esc(c.text)}</p>` +
                    `<p class="meta">IP: ${esc(c.ip)} • ${esc(c.created_at)}</p>`;
                card.appendChild(replyBlock('chat', c, loadChatAdmin));
                wrap.appendChild(card);
            });
        } catch (err) {
            if (err.message !== 'Sesi berakhir, silakan login ulang.') {
                toast(err.message);
            }
        }
    }

    // ---------- product ----------
    async function loadProductForm() {
        try {
            const cfg = await apiPublic('GET', '/api/config');
            $('#prodAnnouncement').value = cfg.shop.announcement || '';
            $('#prodDescription').value = cfg.shop.description || '';
            $('#prodSpecs').value = (cfg.shop.specs || [])
                .map((row) => (row.v ? `${row.k}: ${row.v}` : row.k)).join('\n');
        } catch (err) {
            toast(err.message);
        }
    }
    $('#productForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.submitter;
        if (btn) btn.disabled = true;
        try {
            const saved = await apiAdmin('PATCH', '/api/admin/product', {
                announcement: $('#prodAnnouncement').value,
                description: $('#prodDescription').value,
                specs: $('#prodSpecs').value,
            });
            // Re-fill from the server response, never trust local input.
            $('#prodAnnouncement').value = saved.announcement || '';
            $('#prodDescription').value = saved.description || '';
            $('#prodSpecs').value = saved.specs || '';
            toast('Produk tersimpan');
        } catch (err) {
            toast(err.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // ---------- stats ----------
    async function loadStats() {
        try {
            const s = await apiAdmin('GET', '/api/admin/stats');
            $('#statsGrid').innerHTML =
                `<div class="stat-card"><strong>${s.order_count}</strong><span>Total Pesanan</span></div>` +
                `<div class="stat-card"><strong>${s.orders_by_status.datang}</strong><span>Dikonfirmasi (Datang)</span></div>` +
                `<div class="stat-card"><strong>${s.orders_by_status.ragu}</strong><span>Belum Dibayar (Ragu)</span></div>` +
                `<div class="stat-card"><strong>${s.orders_by_status.berhalangan}</strong><span>Dibatalkan</span></div>` +
                `<div class="stat-card"><strong>${s.total_guests}</strong><span>Total Tamu</span></div>` +
                `<div class="stat-card"><strong>${s.review_count}</strong><span>Ulasan</span></div>` +
                `<div class="stat-card"><strong>${s.rating_avg === null ? '-' : s.rating_avg}</strong><span>Rating Rata-rata</span></div>` +
                `<div class="stat-card"><strong>${s.followers}</strong><span>Pengikut Toko</span></div>` +
                `<div class="stat-card"><strong>${s.chat_count}</strong><span>Chat Masuk</span></div>`;
        } catch (err) {
            if (err.message !== 'Sesi berakhir, silakan login ulang.') {
                toast(err.message);
            }
        }
    }

    // ---------- password ----------
    $('#pwForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = $('#pwError');
        errEl.hidden = true;
        const oldPw = $('#pwOld').value;
        const newPw = $('#pwNew').value;
        const newPw2 = $('#pwNew2').value;
        if (newPw.length < 8) {
            errEl.textContent = 'Password baru minimal 8 karakter.';
            errEl.hidden = false;
            return;
        }
        if (newPw !== newPw2) {
            errEl.textContent = 'Password baru tidak sama dengan ulangannya.';
            errEl.hidden = false;
            return;
        }
        const btn = e.submitter;
        if (btn) btn.disabled = true;
        try {
            await apiAdmin('POST', '/api/admin/password', { old_password: oldPw, new_password: newPw });
            alert('Password diubah. Silakan login ulang.');
            await logout();
        } catch (err) {
            errEl.textContent = err.status === 401 ? 'Password lama salah.' : err.message;
            errEl.hidden = false;
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // ---------- login / logout ----------
    $('#loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = $('#loginError');
        errEl.hidden = true;
        const btn = e.submitter;
        if (btn) btn.disabled = true;
        try {
            const data = await apiPublic('POST', '/api/session', {
                email: $('#loginEmail').value.trim(),
                password: $('#loginPassword').value,
            });
            setToken(data.token);
            $('#loginPassword').value = '';
            hideLogin();
            switchView('orders');
        } catch (err) {
            if (err.status === 401) {
                errEl.textContent = 'Email atau password salah.';
            } else if (err.status === 429) {
                errEl.textContent = 'Terlalu banyak percobaan login. Coba lagi nanti.';
            } else {
                errEl.textContent = 'Koneksi gagal, coba lagi.';
            }
            errEl.hidden = false;
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    async function logout() {
        const token = getToken();
        if (token) {
            try {
                await fetch('/api/session', {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch (e) { /* best-effort revoke */ }
        }
        clearToken();
        showLogin();
    }
    $('#logoutBtn').addEventListener('click', logout);

    // ---------- boot ----------
    if (getToken()) {
        hideLogin();
        switchView('orders');
    } else {
        showLogin();
    }
})();
