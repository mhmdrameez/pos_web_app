# Quick Sale POS

A fast, modern, and offline-first Point of Sale for retail and billing desks. Record sales, print thermal receipts, park orders, and review local history — all in the browser, with no required backend.

Built with React 19, TypeScript, Vite, and SQLite (WASM + OPFS). Fully installable as a standalone PWA.

**Version:** 1.0.55

## Features

- **Quick sale keypad** — Numeric pad plus keyboard input for high-speed billing. Responsive design adapts to desktop (landscape) and mobile/tablet (portrait) with an integrated mini-order list.
- **Entry parser** — Type `price*qty` (for example `30*3` or `30.50*2`). Decimal quantities work for weight/volume (`30*2.50` → ₹75.00).
- **Smart product name suggestions** — The app learns product names from your sales history. When you enter a price, it suggests the most likely product based on price matching, frequency, recency, quantity patterns, and cart context. Accept, change, or dismiss suggestions inline.
- **Inline product naming** — Rename any line item directly in the cart; names are learned for future suggestions.
- **Checkout** — Cash, UPI, or card; optional cash tendered and change calculations.
- **Coupons** — Create and apply discount coupons; print coupon slips on a thermal printer.
- **Saved orders** — Park a cart as a draft and resume later.
- **Sales history** — Browse invoices by date (defaults to the latest day with sales), reprint, edit, or cancel.
- **Thermal printing** — ESC/POS over Web Bluetooth (58mm and 80mm). Chunking, retry, and printer deduplication for reliable receipts.
- **Customer details** — Optional name, Indian mobile number, and email on a bill.
- **Local backups** — Download a JSON snapshot or the live SQLite database file. Restore from a JSON backup (including older v1 exports).
- **Optional Supabase cloud** — Sync sales and coupons when enabled. Daily auto backup uploads the SQLite file to a Storage bucket.
- **Offline-first** — Cart, settings, drafts, sales, coupons, and suggestion stats persist in SQLite (OPFS). First launch migrates data from IndexedDB if present.
- **PWA** — Installable, auto-updating service worker, offline capable. Viewport controls prevent zooming on mobile for a native app feel.
- **Daily digest email** — Optional Resend-powered summary of the day's sales at 10:00 PM local time.

## Tech stack

| Area | Choice |
| --- | --- |
| UI | React 19 + TypeScript |
| Bundler | Vite 8 |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Local DB | SQLite WASM (`@sqlite.org/sqlite-wasm`) in a dedicated worker, stored in OPFS |
| Legacy | Dexie / IndexedDB — one-time migration on first SQLite open |
| Forms / validation | React Hook Form + Zod |
| Tests | Vitest + Testing Library + jsdom |
| Lint | oxlint |
| Integrations | Resend (emails), Supabase (optional sync + Storage backups), Web Bluetooth |
| Deploy | Vercel (static app + serverless function) |

## Screens

- **Quick Sale** — Amount display, keypad, product suggestion bar, live order panel, checkout.
- **Saved Orders** — Draft carts waiting to be completed.
- **Sales History** — Completed invoices by date, reprint, edit, cancel.
- **Coupons** — Create, list, and print coupons.
- **Printer Settings** — Pair Bluetooth printers, choose paper width, toggle product suggestions.
- **App Settings** — Business name, email (Resend), optional Supabase, JSON restore, SQLite download, cloud SQLite upload.

## Getting started

### Requirements

- Node.js 20+ recommended
- npm
- Chrome, Edge, or another Chromium browser for **Web Bluetooth** printing and **OPFS** (SQLite storage)

### Install and run

```bash
npm install
npm run dev
```

The Vite dev server includes a local `POST /api/send-email` proxy so email works without CORS issues.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Typecheck and production build (PWA) |
| `npm run preview` | Preview the production build |
| `npm run test` | Run unit tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run oxlint |

## How to use

### Add line items

1. Enter a price on the keypad or keyboard (`123.50`).
2. Optionally add quantity with `*` (`123.50*2`).
3. If a product name suggestion appears, accept it, pick an alternative, or dismiss.
4. Press **Enter** (or the add control) to put the line on the cart.
5. Tap the product name in the cart to rename any item — names are saved for future suggestions.

**Keyboard (when focus is not in an input):**

| Key | Action |
| --- | --- |
| `0`–`9` | Append digit |
| `.` | Decimal |
| `*` | Quantity separator |
| `Enter` | Add item to cart |
| `Backspace` | Delete last character |
| `Escape` | Clear current amount |

### Product name suggestions

The suggestion engine learns from completed sales and builds a local index of products. As you type a price, the system:

1. **Price matches** — Finds products sold at similar price points using a Gaussian + price-bucket model.
2. **Frequency scores** — Ranks frequently sold products higher.
3. **Recency scores** — Boosts recently sold products with exponential decay.
4. **Quantity patterns** — Detects whether a product is typically sold by piece or by weight.
5. **Cart associations** — If other items in the cart are often bought together with a product, it ranks higher.

The engine uses incremental dirty tracking and a price-bucket index for fast lookups. Suggestions can be disabled in Printer Settings.

### Checkout

Open checkout from the order panel. Choose **cash**, **UPI**, or **card**. For cash you can enter amount paid; change is calculated. Optionally print the receipt immediately. A coupon can be applied when one is available.

### Printing (Web Bluetooth)

1. Open **Printer** settings.
2. Pair a Bluetooth ESC/POS printer (browser must support Web Bluetooth).
3. Choose **58mm** or **80mm**.
4. Print from checkout or reprint from sales history.

The printer service handles reconnection, dropped packets, and auto-chunking (20-byte payload per write) for inexpensive BLE thermal printers.

### Sales history

Open **Sales History**. The date filter starts on the **latest day that has sales** (not necessarily today). Use the date picker to jump to another day; min/max dates follow your actual invoices.

### Backup and restore

In **App settings → Data Management**:

| Action | What it does |
| --- | --- |
| **Download JSON backup** | Exports sales, drafts, settings, coupons, and suggestion stats as a `.json` file. |
| **Restore from JSON** | Replaces local SQLite data from a JSON backup. Supports current and older **v1** files (line items nested as objects). |
| **Download SQLite database** | Saves the live OPFS database as `{business}_sqlite_YYYY-MM-DD.sqlite3` (full dump via SQLite WASM export). |
| **Upload SQLite to Supabase** | Uploads that same `.sqlite3` file to your Storage backup bucket (requires cloud settings below). |

**Restore notes**

- JSON restore is the portable way to move data between browsers or after clearing site data.
- After restore, check **Sales History** on the dates your bills were actually created — they may not be “today”.
- SQLite download is a snapshot of the database file; it is not imported back through the JSON restore button.

### Optional Supabase

In **App settings**, enable cloud and enter:

- Project URL
- Anon (public) key
- Backup bucket name (Storage)

When enabled:

- Completed sales and coupons can sync to Postgres.
- **Auto backup** (same 10:00 PM local window as the daily digest, or every 12 hours) uploads the SQLite file to Storage as `{business}_sqlite_YYYY-MM-DD.sqlite3`.
- The browser must be **open** at backup time for the scheduled upload to run.

The anon key needs Storage **upload** (and upsert) on that bucket. Restrict the bucket in the Supabase dashboard; do not treat the key as a secret for server-only work, but do not grant more than backup upload needs.

### Email and daily digest

In **App settings**, configure your Resend API key (`re_…`), From, and To addresses. A **daily digest** of the calendar day's sales is sent at **22:00 local time**. The browser never calls Resend directly; the API key is posted to your own `/api/send-email` endpoint.

## Data and privacy

Operational data lives **in the user's browser** (SQLite in Origin Private File System):

- Saved orders, completed sales, cart state
- Settings, counters, coupons, and the product suggestion index

There is no mandatory cloud backend. Optional Supabase is off until you enable it. Keep Resend API keys and Supabase credentials secure.

First launch after the SQLite migration copies data from the previous IndexedDB (Dexie) store, then continues on SQLite only.

## Deploy

Configured for Vercel (`vercel.json`): Vite static output in `dist`, plus `/api/*` serverless routes.

```bash
npm run build
```

## Architecture highlights

- **SQLite worker**: All SQL runs in a Web Worker. Nested JSON (sale line items, settings blobs) is stored as TEXT. Export uses `sqlite3_js_db_export` because the OPFS database handle has no `.export()` method.
- **Suggestion engine**: Map-based stats cache and price-bucket indexing for constant-time lookups.
- **PWA**: Service worker, pull-to-refresh prevention on mobile, iOS touch optimizations.
- **Bluetooth printing**: GATT handling for `network_error` dropouts and auto-reconnect.

## License

Private project (`package.json` `"private": true`).
