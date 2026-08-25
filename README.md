# Quick Sale POS

A fast, offline-first Point of Sale for retail and billing desks. Record sales, print thermal receipts, park orders, and review local history — all in the browser, with no required backend.

Built with React 19, TypeScript, Vite, and IndexedDB. Installable as a PWA.

**Version:** 1.0.21

## Features

- **Quick sale keypad** — Numeric pad plus keyboard input for high-speed billing
- **Entry parser** — Type `price*qty` (for example `30*3` or `30.50*2`). Decimal quantities work for weight/volume (`30*2.50` → ₹75.00)
- **Checkout** — Cash, UPI, or card; optional cash tendered and change
- **Saved orders** — Park a cart as a draft and resume later
- **Sales history** — Browse completed invoices, reprint, edit, or cancel
- **Thermal printing** — ESC/POS over Web Bluetooth (58mm and 80mm)
- **Customer details** — Optional name, Indian mobile number, and email on a bill
- **Offline-first** — Cart, settings, drafts, and sales persist in IndexedDB (Dexie), with a localStorage backup for completed sales
- **PWA** — Installable, auto-updating service worker, landscape-oriented standalone display
- **Daily digest email** — Optional Resend-powered summary of the day’s sales at 10:00 PM local time
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

- **Quick Sale** — Amount display, keypad, live order panel, checkout
- **Saved Orders** — Draft carts waiting to be completed
- **Sales History** — Completed invoices and reprint
- **Printer settings** — Pair Bluetooth printers and choose paper width
- **App settings** — Business name and email (Resend) configuration

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
3. Press **Enter** (or the add control) to put the line on the cart.

**Keyboard (when focus is not in an input):**

| Key | Action |
| --- | --- |
| `0`–`9` | Append digit |
| `.` | Decimal |
| `*` | Quantity separator |
| `Enter` | Add item to cart |
| `Backspace` | Delete last character |
| `Escape` | Clear current amount |

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

### Email and daily digest

In **App settings**, set:

- Resend API key (`re_…`)
- From address (must be allowed in Resend)
- To address (where the digest is delivered)

You can send a test email from settings. If email is configured and the app is open, a **daily digest** of that calendar day’s sales is sent at **22:00 local time**. The last-sent date is stored in `localStorage` so a refresh does not double-send.

Email is sent through:

- **Dev:** Vite middleware at `/api/send-email`
- **Production (Vercel):** `api/send-email.js` serverless function

The browser never calls Resend directly; the API key is stored locally in IndexedDB and posted to your own `/api/send-email` endpoint.

## Data and privacy

All operational data lives **in the user’s browser**:

- Saved orders and completed sales
- Cart snapshot
- App and printer settings
- Invoice / order sequence counters

Completed sales are also mirrored in `localStorage` as a backup (`quick-sale-pos:completed-sales`). Clearing site data removes local records. There is no required cloud database.

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
  hooks/                   Persistence, checkout, keyboard shortcuts
  services/
    db/                    Dexie schema and queries
    printer/               ESC/POS + Web Bluetooth
    receipt/               Receipt layout
    email/                 Digest + send helpers
  stores/                  Zustand (cart, app, printer)
  test/                    Vitest suites
  types/                   Shared TypeScript types
```

## Tests

Coverage includes money math, cart behavior, checkout, receipts, and database helpers:

```bash
npm run test
```

## License

Private project (`package.json` `"private": true`).
