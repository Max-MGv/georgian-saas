---
tags: [operations, domains, email, vineworks]
---

# Vineworks — Domain & Email Setup

Full record of setting up `vineworks.ge` as the new domain for the SaaS platform itself (not a client tenant), plus its email. Done 2026-09-09, entirely in one session, walked through step-by-step with Max (new to domains/DNS) and finished by Claude directly driving the browser (Namespace, Vercel, Zoho) once connected via Claude in Chrome.

---

## What was decided

- **Brand/product name:** VineWorks
- **Primary domain:** `vineworks.ge` — bought on Namespace.ge for 50 GEL/year
- **Typo-protection domain:** `wineworks.ge` — also bought on Namespace.ge, redirects to the main domain in case customers mistype "vine" as "wine"
- Both registered through **2028-09-08**

### Domain price check (before committing further money)
Namespace's 50 GEL/year for `.ge` matches the registry's own wholesale floor price (Caucasus Online raised it to 50 GEL/year in March 2024) — not a markup. A cheaper option exists — **FindDomain.ge** was running a promo at 40 GEL/year (or 30 GEL/year on a 2+ year commitment) — but since both domains were already bought on Namespace by the time this was found, no action was taken. Worth remembering for the *next* domain purchase.

### Where things are hosted
- **DNS**: both domains' nameservers point at **Vercel** (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`), not Namespace. Namespace is registrar-of-record only now — all actual DNS records (site routing + email) are managed from the Vercel dashboard.
- **Site**: Vercel project `georgian-saas`, team `MG_Productions`
- **Email**: Zoho Mail

---

## Vercel domain configuration

Project: `georgian-saas` → Settings → Domains

| Domain | Role |
|---|---|
| `www.vineworks.ge` | **Production domain** — the real site |
| `vineworks.ge` (apex) | 308 permanent redirect → `www.vineworks.ge` |
| `wineworks.ge` | 308 permanent redirect → `www.vineworks.ge` |
| `www.wineworks.ge` | 308 permanent redirect → `www.vineworks.ge` |

**⚠️ Flagged, not yet acted on:** the Vercel team (`MG_Productions`) is on the **Hobby** plan. Hobby is meant for personal/non-commercial projects — running a paying B2B SaaS on it isn't really within its terms, and it carries stricter usage limits than Pro. **Upgrade to Pro (~$20/month) before onboarding the first real paying client.**

---

## Email — Zoho Mail

- **Provider:** Zoho Mail, EU data center (`mail.zoho.eu`) — auto-assigned by Zoho based on signup location, not chosen deliberately
- **Plan:** ended up on **Mail Free** (up to 5 users, 5GB each) — the paid-plan-only screen Zoho showed mid-signup turned out to be a display quirk; the actual org landed on the free tier. **No payment was made.**
- **Mailbox created:** `max@vineworks.ge` (super admin / account owner)
- Up to 4 more mailboxes can be added free (e.g. `info@`, `support@`) — see Zoho's **Setup Users** page

### Known limitation of the free plan
No IMAP/POP access — mail can only be checked through Zoho's own webmail or app, not through Gmail/Outlook's own inbox. If that turns out to matter day-to-day, the fix is upgrading to **Mail Lite** ($1.25/user/month), not switching data-center region (region-hopping to find a "better" free tier was considered and deliberately rejected — see reasoning below).

### Why we didn't chase a non-EU signup for a "better" free plan
Georgia's IP/location auto-routes new Zoho signups to the EU data center. A US-region signup was possible in principle (manually overriding the country field at signup), but:
1. It would have required deleting/abandoning the org already created against the EU data center — Zoho ties an org to one data center permanently; moving it later requires Zoho support intervention.
2. The free plan's IMAP restriction applies in every region — it wouldn't have solved the actual goal (checking mail through Gmail).
3. Misrepresenting location to route around a regional gate sits in a grey area against Zoho's own terms.

Decision: stayed on the EU free plan as-is.

---

## DNS records added (all in Vercel's DNS panel for `vineworks.ge`)

| Type | Name/Host | Value | Priority | Purpose |
|---|---|---|---|---|
| TXT | `@` | `zoho-verification=zb02525682.zmverify.zoho.eu` | – | Proves domain ownership to Zoho |
| MX | `@` | `mx.zoho.eu` | 10 | Mail delivery |
| MX | `@` | `mx2.zoho.eu` | 20 | Mail delivery (backup) |
| MX | `@` | `mx3.zoho.eu` | 50 | Mail delivery (backup) |
| TXT | `@` | `v=spf1 include:zohomail.eu ~all` | – | SPF — stops spoofed mail claiming to be from `vineworks.ge` |
| TXT | `zmail._domainkey` | `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC25son1HN8j6x2zURsAjQBiVguZwbmvVE0NiW7AtMO0PbE9gHAM/Z5PYxmPECdZPsLix/X8T91FUOG4FD8Ta7EV/4HdiOCdo4GtcEVWCAIKPVubm5OorK/OjE6PMK7Yx8eAcdMZMIx6p9dYQ8tn0K19cWf7B4krla2Bi9/tmOaXwIDAQAB` | – | DKIM — cryptographically signs outgoing mail, keeps it out of spam |

**Verification status (2026-09-09):** Zoho confirmed *"All the records have been verified successfully"* — domain ownership, MX, SPF, and DKIM all passed. Email is fully live: `max@vineworks.ge` can send and receive, properly authenticated.

If any of these ever need re-adding (e.g. domain moved off Vercel DNS), the source of truth is Zoho's own setup page: `mailadmin.zoho.eu/hosting?domain=vineworks.ge` → DNS Mapping.

---

## Nameserver migration (Namespace → Vercel)

Both domains originally used Namespace's own nameservers (`ns1.ge` / `ns2.ge`). Switched to Vercel's (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`) via Namespace's domain panel → NS Records → "Other NS Records".

Reasoning: needed one place to manage both the site-routing records (A/CNAME to Vercel) and the email records (MX/SPF/DKIM/TXT for Zoho) — using Vercel as the single DNS host avoids juggling two dashboards for every future record change.

**Propagation note:** the change showed "success" in Namespace's UI almost immediately, but the `.ge` registry itself took about 6 minutes to actually reflect it (confirmed by querying `ns1.nic.ge` directly rather than trusting a cached resolver). Worth remembering next time: Namespace's own "success" message is not proof the change is live yet — check the registry directly if verifying urgently, or just wait ~15–30 min.

---

## Credentials

Login details (Namespace, Vercel, Zoho account) are **not** duplicated here — see `credentials.txt` at the repo root (gitignored). Max should add the Zoho mailbox password there himself since it was set directly by him, not by Claude.

---

## Nikalas Marani migrated to nikalasmarani.vineworks.ge (2026-09-10)

The Nikalas Marani tenant's real public domain moved from `nikalasmarani.vercel.app` to `nikalasmarani.vineworks.ge`, now that `vineworks.ge` is under Max's control. Steps taken (all on the `georgian-saas` Vercel project):

1. Added `nikalasmarani.vineworks.ge` as a Production domain — DNS auto-configured with zero manual records needed, since Vercel already owns `vineworks.ge`'s zone from the original setup (unlike that original setup, which needed the nameserver migration first).
2. Verified it connected (hit the generic `/welcome` placeholder before the DB change — confirms routing works with no tenant match yet, a safe way to test before the real cutover).
3. Updated `Tenant.domain` for Nikalas Marani in the **production** database, `nikalasmarani.vercel.app` → `nikalasmarani.vineworks.ge`. This is a single unique-string field — `proxy.ts` resolves tenants by exact match, so there's no way to have both domains live for the same tenant at once; the switch is a hard cutover, not gradual.
4. Set `nikalasmarani.vercel.app` to a 308 permanent redirect → `nikalasmarani.vineworks.ge`, so old bookmarks/links still work.
5. Hit the documented `proxy.ts` 5-minute tenant-domain cache gotcha (see `MaintenanceNotes.md` / `KNOWN-ISSUES.md`) — the new domain briefly still showed the `/welcome` placeholder even after the DB update, because an earlier verification request had already cached "no tenant" for that domain. Not a bug — waited out the TTL, confirmed clean afterward.

Verified live: homepage, `/wines`, `/admin/login` all `200` on the new domain with the real site title; old domain correctly 308s through to the new one.

**Not addressed by this migration:** `nikalasmarani.ge` (the actual `.ge` custom domain Max separately owns) does **not** point at this app at all — it currently serves something else entirely (redirects to a `/ka` path-based locale structure this codebase doesn't have). Found while testing 2026-09-10, not investigated further — likely an old/different site still live on that domain's DNS. Worth Max checking directly if he wants `nikalasmarani.ge` itself pointed here too.

## Outstanding / not yet done

- [ ] Upgrade Vercel team off the Hobby plan before real paying customers (see above)
- [ ] Confirm IMAP need — if Max wants to check `max@vineworks.ge` through Gmail/Outlook, upgrade to Zoho Mail Lite ($1.25/mo)
- [ ] Add more mailboxes if needed (e.g. `info@vineworks.ge`, `support@vineworks.ge`) — free, up to 5 total users
- [ ] `wineworks.ge` / `www.wineworks.ge` — confirmed 2026-09-10 this is **not** mid-propagation flakiness as originally assumed: both still show "Invalid Configuration" in Vercel a day later. Needs an actual look (check DNS records/nameservers), not just a wait.
- [ ] Decide what actually goes live at `www.vineworks.ge` — this session only wired up hosting/domain/email, no site content
- [ ] Investigate why `nikalasmarani.ge` doesn't point at the georgian-saas app (see above) — separate from the `.vineworks.ge` migration just done
