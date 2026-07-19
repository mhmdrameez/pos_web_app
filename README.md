# Quick Sale POS

A fast, lightweight, and modern offline-first Point of Sale (POS) application built using React, TypeScript, and Vite. Designed specifically for retail and billing desks to record transactions, print receipts, and track local sales history efficiently.

## Core Features

- **Offline-First Persistence**: Powered by IndexedDB (via Dexie) to save sales history, saved orders, and cart status locally in the browser.
- **Dynamic Entry Parser**: Supports instant calculations like `[price]*[quantity]` (e.g. `30*3`) or decimal prices with integer quantities (e.g. `30.50*2`) directly in the amount entry field.
- **Flexible Decimal Quantity Logic**: Supports calculation of weight/volume line totals (e.g., `30 * 2.50` calculates as ₹75.00), while treating each non-integer item entry as `1` in the final "Total Quantity" summary card.
- **ESC/POS Thermal Receipt Printing**: Built-in support for printing formatted hard-copy receipts directly via Web Bluetooth printers (supporting 58mm and 80mm widths).
- **Sales History & Analytics**: View locally completed orders, reprint previous receipts, or delete records.
- **Automatic Versioning & CI**: Configured with GitHub Actions workflow to auto-increment the application build/patch version on every push to the default branch.

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Bundler**: Vite 8
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **Database**: Dexie (IndexedDB wrapper)
- **Testing**: Vitest + jsdom

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Run unit tests
npm run test
```

### Production Build

```bash
# Build the PWA production assets
npm run build
```
