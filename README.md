# Quick Sale POS

A fast, modern, and offline-first Point of Sale for retail and billing desks. Record sales, print thermal receipts, park orders, and review local history — all in the browser, with no required backend.

Built with React 19, TypeScript, Vite, and IndexedDB. Fully installable as a standalone PWA.

**Version:** 1.0.41

## Features

- **Quick sale keypad** — Numeric pad plus keyboard input for high-speed billing. Responsive design adapts beautifully to both desktop (landscape) and mobile/tablet (portrait) with an integrated mini-order list.
- **Entry parser** — Type `price*qty` (for example `30*3` or `30.50*2`). Decimal quantities work for weight/volume (`30*2.50` → ₹75.00).
- **Smart product name suggestions** — The app learns product names from your sales history. When you enter a price, it suggests the most likely product based on price matching, frequency, recency, quantity patterns, and cart context. Accept, change, or dismiss suggestions inline. Configurable via settings.
- **Inline product naming** — Rename any line item directly in the cart; names are learned for future suggestions.
- **Checkout** — Cash, UPI, or card; optional cash tendered and change calculations.
- **Saved orders** — Park a cart as a draft and resume later.
- **Sales history** — Browse completed invoices, reprint, edit, or cancel.
- **Thermal printing** — ESC/POS over Web Bluetooth (58mm and 80mm). Robust chunking, retry mechanisms, and printer deduplication ensure reliable receipt generation.
- **Customer details** — Optional name, Indian mobile number, and email on a bill.
- **Google Drive Backup & Restore** — Connect your Google Drive account using OAuth (fully compatible with desktop and standalone Android PWAs) to automatically or manually backup and restore all your sales, settings, and product data to a dedicated folder. Local JSON file backups are also supported.
- **Offline-first** — Cart, settings, drafts, and sales persist in IndexedDB (Dexie), with a localStorage backup for completed sales.
- **PWA** — Installable, auto-updating service worker, offline capable. Strict viewport controls prevent zooming on mobile devices for a native app feel.
- **Daily digest email** — Optional Resend-powered summary of the day's sales at 10:00 PM local time.

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
| Integrations | Resend API (Emails), Google Drive API (Backups), Web Bluetooth |
| Deploy | Vercel (static app + serverless function) |

## Screens

- **Quick Sale** — Amount display, keypad, product suggestion bar, live order panel, checkout. Adapts gracefully between landscape and portrait views.
- **Saved Orders** — Draft carts waiting to be completed.
- **Sales History** — Completed invoices and reprint.
- **Printer Settings** — Pair Bluetooth printers, choose paper width, and toggle product suggestions.
- **App Settings** — Business name, email (Resend) configuration, Google Drive connection, and data backup & restore.

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
3. **Recency scores** — Boosts recently sold products with exponential decay.
4. **Quantity patterns** — Detects whether a product is typically sold by piece or by weight.
5. **Cart associations** — If other items in the cart are often bought together with a product, it ranks higher.

The engine uses **incremental dirty tracking** and a **price-bucket index** for fast lookups — performance stays constant regardless of data size. Suggestions can be disabled entirely in Printer Settings if desired.

### Checkout

Open checkout from the order panel. Choose **cash**, **UPI**, or **card**. For cash you can enter amount paid; change is calculated. Optionally print the receipt immediately.

### Printing (Web Bluetooth)

1. Open **Printer** settings.
2. Pair a Bluetooth ESC/POS printer (browser must support Web Bluetooth).
3. Choose **58mm** or **80mm**.
4. Print from checkout or reprint from sales history.

The printer service handles reconnection, dropped packets, and auto-chunking (20-byte payload per write) to reliably support inexpensive BLE thermal printers.

### Cloud and Local Backup

In **App settings → Data Management**:

- **Google Drive** — Enter your Google OAuth Client ID to connect. Supports standalone Android PWAs (via implicit redirect flow) and desktop Chrome (via popup flow).
- **Auto Backup** — Runs a daily scheduled backup directly to the `QuickSale_Backups` folder in your Drive.
- **Local File** — Export all data as a single `.json` file and restore it on any device.

### Email and daily digest

In **App settings**, configure your Resend API key (`re_…`), From, and To addresses. A **daily digest** of the calendar day's sales is sent at **22:00 local time**. The browser never calls Resend directly; the API key is posted to your own `/api/send-email` endpoint.

## Data and privacy

All operational data lives **in the user's browser**:

- Saved orders, completed sales, and cart state
- Settings, counters, and the product suggestion index

There is no mandatory cloud backend. Data is entirely yours. Keep your Resend API keys and Google OAuth Client IDs secure.

## Deploy

Configured for Vercel (`vercel.json`): Vite static output in `dist`, plus `/api/*` serverless routes.

```bash
npm run build
```

## Architecture highlights

- **Suggestion engine**: Designed for constant-time performance using a `Map`-based stats cache and price-bucket indexing, yielding smooth non-blocking interactions.
- **PWA robustness**: Comprehensive service worker config, custom pull-to-refresh prevention on mobile devices, iOS touch optimizations, and OAuth flow management tailored for standalone PWAs.
- **Bluetooth printing**: Complex GATT connection handling abstracting `network_error` dropouts and providing resilient auto-reconnect logic.

## License

Private project (`package.json` `"private": true`).
