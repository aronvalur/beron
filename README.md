# Beron — Employee Gifting & Recognition Platform (MVP)

A working B2B SaaS + concierge platform for Icelandic companies to manage
employee birthdays, Christmas gifting, and special-occasion gifts, with
manual fulfillment handled by the Beron team.

## What's included (V1 scope)

- Multi-tenant companies, each with employees, admins (max 5), a subscription
  plan, billing details, events, and gift orders.
- Two roles: **Company Admin** (HR/owner) and **Super Admin** (Beron staff).
- Automatic birthday detection (30-day lookahead) and annual Christmas event
  generation for companies on the Birthdays + Christmas plan.
- Manual gift order creation from events, or as one-off custom orders
  (new hire, promotion, life event, etc.).
- Manual fulfillment tracking: pending → ordered → shipped → delivered.
- Subscription & billing page (kennitala, billing email/address, plan
  selection, invoice preview) — no payment processor; invoicing is manual.
- Settings page for company details, admin management, and notification
  preferences.
- Super Admin views across all companies: overview, company list/detail,
  all gift orders (with fulfillment controls), and all upcoming events.

No employee login, automation, or integrations — matching the "V1 not
required" list in the product spec.

## Tech stack

Plain Node.js + Express + EJS templates, with a small **JSON-file data
store** instead of a database engine (`db/data.json`). This was a deliberate
choice for portability: it needs no database server, no native compiled
modules, and no build step — it runs anywhere Node.js runs. Swapping in a
real database (Postgres, SQLite, etc.) later just means replacing
`db/store.js` — nothing else needs to change.

## Running it

Requires [Node.js](https://nodejs.org) 18+.

```bash
cd beron
npm install
npm start
```

Then open **http://localhost:3000**.

Demo data (two example companies) is created automatically on first run.

**Demo logins** (password for all: `beron123`):

| Role | Email |
|---|---|
| Company Admin (Nordic Tech ehf., Birthdays + Christmas plan) | sigrun@nordictech.is |
| Company Admin (Fjord Retail ehf., Birthdays only plan) | magnus@fjordretail.is |
| Beron Super Admin | admin@beron.is |

To reset all demo data, delete `db/data.json` and restart the server.

## Project structure

```
beron/
  server.js          Entry point — Express app, sessions, routing
  db/
    store.js          JSON file-backed data layer (all persistence)
    seed.js            Demo data seeding
    data.json          Created automatically at first run
  lib/
    events.js          Birthday/Christmas event generation logic
    pricing.js          Subscription plan pricing
  middleware/
    auth.js            Login + role-based access guards
  routes/               One file per feature area
  views/                EJS templates (corporate SaaS styling)
  public/css/style.css  All styling
```

## Notes on production readiness

This is an MVP meant to demonstrate the full workflow end-to-end. Before
running it for real customers, you'd want to: move to a real database,
add password hashing rotation/reset via email, add CSRF protection, and
connect actual email delivery for the notification preferences already
stored on each company.
