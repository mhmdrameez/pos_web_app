# Quick Sale POS

A fast, offline-first Point of Sale for retail and billing desks. Record sales, print thermal receipts, park orders, and review local history — all in the browser, with no required backend.

Built with React 19, TypeScript, Vite, and IndexedDB. Installable as a PWA.

**Version:** 1.0.25

## Features

- **Quick sale keypad** — Numeric pad plus keyboard input for high-speed billing
- **Entry parser** — Type `price*qty` (for example `30*3` or `30.50*2`). Decimal quantities work for weight/volume (`30*2.50` → ₹75.00)
- **Smart product name suggestions** — The app learns product names from your sales history. When you enter a price, it suggests the most likely product based on price matching, frequency, recency, quantity patterns, and cart context. Accept, change, or dismiss suggestions inline
- **Inline product naming** — Rename any line item directly in the cart; names are learned for future suggestions
- **Checkout** — Cash, UPI, or card; optional cash tendered and change
- **Saved orders** — Park a cart as a draft and resume later
- **Sales history** — Browse completed invoices, reprint, edit, or cancel
- **Thermal printing** — ESC/POS over Web Bluetooth (58mm and 80mm)
- **Customer details** — Optional name, Indian mobile number, and email on a bill
- **Backup & restore** — Download all data (sales, orders, settings, product suggestions) as a JSON file from App Settings; restore from a backup at any time
- **Offline-first** — Cart, settings, drafts, and sales persist in IndexedDB (Dexie), with a localStorage backup for completed sales
- **PWA** — Installable, auto-updating service worker, landscape-oriented standalone display
- **Daily digest email** — Optional Resend-powered summary of the day's sales at 10:00 PM local time
- **Auto version bump** — GitHub Actions increments the patch version on pushes to the default branch

## Tech stack

| Area | Choice |
| --- | --- |
| UI | React 19 + TypeScript |
| Bundler | Vite 8 |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Local DB | Dexie (IndexedDB) |
| Forms / validation | React Hook Form + Zod |
| Tests | Vitest + Testing Library + jsdom |
| Lint | oxlint |
| Email | Resend via `/api/send-email` |
| Deploy | Vercel (static app + serverless function) |

## Screens

- **Quick Sale** — Amount display, keypad, product suggestion bar, live order panel, checkout
- **Saved Orders** — Draft carts waiting to be completed
- **Sales History** — Completed invoices and reprint
- **Printer settings** — Pair Bluetooth printers and choose paper width
- **App settings** — Business name, email (Resend) configuration, and data backup & restore

## Getting started

### Requirements

- Node.js 20+ recommended
- npm
- Chrome, Edge, or another Chromium browser for **Web Bluetooth** printing

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

The suggestion engine automatically learns from completed sales and builds a local index of products. As you type a price, the system:

1. **Price matches** — Finds products sold at similar price points using a Gaussian + price-bucket model.
2. **Frequency scores** — Ranks frequently sold products higher.
3. **Recency scores** — Boosts recently sold products with exponential decay (21-day half-life).
4. **Quantity patterns** — Detects whether a product is typically sold by piece or by weight.
5. **Cart associations** — If other items in the cart are often bought together with a product, it ranks higher.

Suggestions appear in a bar above the keypad with **Accept**, **Change** (pick from known products or type a new name), and **Not this** (dismiss) actions.

The engine uses **incremental dirty tracking** and a **price-bucket index** for fast lookups — performance stays constant regardless of data size.

### Checkout

Open checkout from the order panel. Choose **cash**, **UPI**, or **card**. For cash you can enter amount paid; change is calculated. Optionally print the receipt immediately.

### Saved orders

Save the current cart as a draft, then reopen it from **Saved Orders** to continue or complete payment.

### Printing

1. Open **Printer** settings.
2. Pair a Bluetooth ESC/POS printer (browser must support Web Bluetooth).
3. Choose **58mm** or **80mm**.
4. Print from checkout or reprint from sales history.

If the printer disconnects, a reconnect banner appears so you can restore the link without leaving the sale.

### Backup & restore

In **App settings → Data Management**:

- **Download Backup** — Exports all data (completed sales, saved orders, app settings, printer settings, product suggestion index, counters) into a single `.json` file.
- **Restore Backup** — Upload a previously downloaded backup file. A confirmation dialog warns that all existing data will be replaced. After restore, the page reloads to reinitialize.

Use this to transfer data between devices or recover after clearing browser data.

### Email and daily digest

In **App settings**, set:

- Resend API key (`re_…`)
- From address (must be allowed in Resend)
- To address (where the digest is delivered)

You can send a test email from settings. If email is configured and the app is open, a **daily digest** of that calendar day's sales is sent at **22:00 local time**. The last-sent date is stored in `localStorage` so a refresh does not double-send.

Email is sent through:

- **Dev:** Vite middleware at `/api/send-email`
- **Production (Vercel):** `api/send-email.js` serverless function

The browser never calls Resend directly; the API key is stored locally in IndexedDB and posted to your own `/api/send-email` endpoint.

## Data and privacy

All operational data lives **in the user's browser**:

- Saved orders and completed sales
- Cart snapshot
- App and printer settings
- Invoice / order sequence counters
- Product suggestion index (learned product names, prices, and associations)

Completed sales are also mirrored in `localStorage` as a backup (`quick-sale-pos:completed-sales`). Clearing site data removes local records. There is no required cloud database.

Use the **Backup & Restore** feature in App Settings to export and import all data.

Treat Resend keys as secrets: they are stored in IndexedDB on that device. Do not commit keys to git.

## Deploy

Configured for Vercel (`vercel.json`): Vite static output in `dist`, plus `/api/*` serverless routes.

```bash
npm run build
```

SPA routes rewrite to `index.html`; API paths stay on `/api/:path*`.

## Project layout

```
api/send-email.js          Vercel email function
src/
  components/              Quick sale, history, printer, settings, layout
    quick-sale/            Keypad, order panel, checkout, product suggestion bar
    settings/              App settings modal (email, backup & restore)
    sales-history/         Completed sales browser
    saved-orders/          Draft order management
    printer/               Printer settings and connection
    layout/                App shell and navigation
    ui/                    Shared UI components (Button, Modal, etc.)
  hooks/                   Persistence, checkout, keyboard shortcuts, product suggestion
  services/
    db/                    Dexie schema, queries, backup & restore
    suggestion/            Product name suggestion engine, scoring, and indexing
    printer/               ESC/POS + Web Bluetooth
    receipt/               Receipt layout
    email/                 Digest + send helpers
  stores/                  Zustand (cart, app, printer, suggestion UI)
  test/                    Vitest suites
  types/                   Shared TypeScript types
  utils/                   Money formatting, validation, ID generation
```

## Architecture: Suggestion engine

The product suggestion system is designed for **constant-time performance** regardless of data size:

| Component | Purpose |
| --- | --- |
| `engine.ts` | In-memory `Map`-based stats with dirty tracking and price-bucket index |
| `scoring.ts` | Gaussian price similarity, frequency, recency, quantity, and association scoring |
| `productName.ts` | Name normalization, display formatting, and line parsing |
| `index.ts` | Orchestrates rebuild (batched with yielding), incremental persistence, and fingerprinting |

**Key optimizations:**
- **Incremental persistence** — Only changed stats/pairs are written to IndexedDB after each sale (not the entire index)
- **Price-bucket index** — `suggest()` scans only ~7 adjacent buckets instead of all products
- **O(1) fingerprint** — Sales count and latest timestamp are tracked on the counters table, avoiding a full scan
- **Non-blocking startup** — UI renders immediately; suggestion index loads in the background
- **Batched rebuild** — Full rebuild processes sales in batches of 200 with `setTimeout` yielding

## Tests

Coverage includes money math, cart behavior, checkout, receipts, and database helpers:

```bash
npm run test
```

## License

Private project (`package.json` `"private": true`).
