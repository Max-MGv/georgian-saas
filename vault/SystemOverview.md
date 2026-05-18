---
tags: [overview]
---

# System Overview

High-level view of all external systems — where the code lives, where it runs, where data is stored.

---

## Browser
- type: user
- connects-to: Vercel

The end user's device — Chrome, Safari, mobile browser. Nothing is installed here, just a URL. Two types of users visit: customers booking a visit, and the admin managing orders and companies.

**Users:**
- Customers — visit the public booking form, no login required
- Admin — logs into `/admin` to manage orders, companies, and statistics

**Cost:** Free — no hosting needed

---

## GitHub
- type: repo
- connects-to: Vercel

Where all the code lives. Every push to the master branch automatically triggers a new Vercel deployment — no manual steps needed. Also hosts the public project dashboard via GitHub Pages.

**What lives here:**
- `saas/` — the main Next.js booking app
- `dashboard/` — this React Flow project dashboard
- `vault/` — the Obsidian markdown files driving the dashboard

**Cost:** Free

---

## Vercel
- type: host
- connects-to: Supabase

Hosts and runs the Next.js app. Serves all pages, handles form submissions, runs server-side logic. Auto-deploys whenever code is pushed to GitHub. Each client gets their own Vercel project — fully isolated.

**What runs here:**
- Public booking form
- Admin panel (orders, companies, statistics)
- All server actions (create booking, edit order, manage prices)

**Cost:** Free (Hobby plan) — sufficient for one client

---

## Supabase
- type: backend
- connects-to:

Managed cloud service providing the PostgreSQL database and admin authentication. Each client gets their own free Supabase project — data is completely isolated between clients.

**What lives here:**
- PostgreSQL database — orders, companies, price tiers
- Auth — admin login sessions and credentials

**Cost:** Free tier — 500MB database, 50,000 monthly active users

