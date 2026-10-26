# NikahPee

A Shopee-style digital wedding invitation. The invitation is a product page: the wedding itself is the product, attendance is the variation, and ordering is the RSVP.

**Live demo:** https://nikahpee.vercel.app

![Usra and Zee couple art](assets/images/couple.webp)

## About

NikahPee turns a wedding invitation into a Shopee storefront. The shop is "Usra & Zee Official Store" (@usrazeeofficial, Star Seller). The product is the wedding invitation itself, priced at Rp0 (strikethrough Rp10.000.000, 100% discount, free shipping), with a Flash Sale countdown to the wedding day. There are no traditional invitation sections: no event details page, no countdown widget, no RSVP form, no guestbook, no gift section, no gallery grid, and no music player. Everything happens through shop mechanics: variation, cart, checkout, order tracking, reviews, follow, and seller chat.

The couple is Usra & Zee. The event date is Monday, 17 January 2050 (Akad 10.00, Resepsi 13.00).

## Features

- **Shop page:** store header with Star Seller badge, product price Rp0 with strikethrough Rp10.000.000, 100% discount, free shipping, and a Flash Sale countdown to 2050-01-17T10:00:00+07:00.
- **Variation and cart:** attendance variations Datang, Berhalangan, and Masih Ragu, plus quantity, with a localStorage cart.
- **Checkout:** recipient name, message for the seller, and an optional digital envelope (SeaBank/DANA dummy accounts with working copy buttons). Checkout produces an order number and tracking.
- **Order statuses:** Datang becomes Dikonfirmasi, Berhalangan becomes Dibatalkan, Masih Ragu becomes Belum Dibayar. One order per guest name; re-ordering updates the existing order.
- **Reviews:** a review can only be posted for a name that already has an order.
- **Follow store:** per-IP follow toggle, same as the follow mechanic on the author's other invitations.
- **Seller chat:** private guest-to-seller chat with seller replies from the dashboard.
- **Other products:** "Produk Lain dari Toko Ini" links to the author's five other invitations.
- **Seller Centre dashboard:** fresh dashboard with Pesanan, Ulasan, Chat, Produk, Performa, and Pengaturan. It is not a reuse of the older wedding admin templates.

## Architecture

- **Frontend:** static pages (`index.html`, `dashboard.html`) with vanilla JavaScript (`js/app.js`, `js/dash.js`) and plain CSS (`css/app.css`, `css/dashboard.css`). No framework, no build step.
- **Backend:** zero-dependency Node.js Vercel Functions under `api/`, backed by a versioned JSON document in a private Vercel Blob store (`nikahpee-db`). Passwords use scrypt; admin sessions use HS256 JWT with token-version revocation.
- **Hosting:** Vercel project `nikahpee` (SSO disabled). `/dashboard` rewrites to `/dashboard.html`. Deploy with `deploy_nikahpee.py` (MCP deploy, not git-connected).
- **Secrets:** stored only in the deploy environment, never in this repo. See Environment Variables below.

## API

Public endpoints (guest key not required; guest actions are rate-limited):

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/config` | Public shop data, orders count, reviews, rating |
| GET, POST | `/api/order` | Look up an order by guest name; place or update an order |
| POST | `/api/order/cancel` | Cancel an order |
| GET, POST | `/api/reviews` | List reviews; post a review (requires an existing order with the same name) |
| GET, POST | `/api/follow` | Follow status; toggle follow (per IP) |
| POST | `/api/chat` | Send a guest chat message |
| POST, DELETE | `/api/session` | Admin login; admin logout |

Admin endpoints (admin JWT required):

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/admin/orders` | List orders |
| DELETE | `/api/admin/order` | Delete an order |
| GET | `/api/admin/reviews` | List reviews |
| DELETE | `/api/admin/review` | Delete a review |
| POST | `/api/admin/reply` | Reply to a chat message |
| GET | `/api/admin/follows` | List followers |
| DELETE | `/api/admin/follow` | Remove a follower |
| GET | `/api/admin/chat` | List chat threads |
| DELETE | `/api/admin/chat` | Delete a chat thread |
| PATCH | `/api/admin/product` | Update shop and product data |
| POST | `/api/admin/password` | Change the admin password |
| GET | `/api/admin/stats` | Store performance stats |

## Environment Variables

Names only. Values are never committed.

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `AUTH_SECRET`
- `BLOB_READ_WRITE_TOKEN`

## Notes

- The gift accounts (SeaBank/DANA) are dummy numbers for demonstration; the copy buttons are fully functional.
- The live site starts with an empty store: orders, reviews, follows, and chats only appear once visitors use them.

## Credits

Original work by Rahmatul Usra. The couple art is the author's own. No template was used.

## License

MIT. See [LICENSE](LICENSE).
