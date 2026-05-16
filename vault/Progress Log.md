---
tags: [log]
---

# Progress Log

Most recent entry at the top.

---

## 2026-05-16 — Project dashboard built + click bug fixed

- Built standalone Next.js 16 (Turbopack) app at `claude-projects/project-dashboard/`
- Tech: React Flow (`@xyflow/react`), react-markdown, Tailwind CSS
- Reads directly from this Obsidian vault — no separate data source
- **Overview view**: 4 phase nodes (MVP → v1.1 → v2 → v3) in a horizontal chain, each with progress bar
- **Phase drill-down**: click a phase → graph re-renders with section nodes
- **Detail panel**: click a section node → slide-in panel with task checklist + rendered markdown
- Parser reads `Roadmap.md` for structure, `MVP Features.md` for detail content, `Progress Log.md` for last-updated date
- Fixed click bug: moved click handling to React Flow's `onNodeClick` prop (was blocked by `elementsSelectable={false}`)
- Build passes cleanly (TypeScript + Turbopack)
- **To run:** `cd claude-projects/project-dashboard && npm run dev` → opens at `localhost:3000`
- **Next:** scaffold the main Georgian SaaS app (Next.js + Supabase + Prisma)

---

## 2026-05-16 — Project kickoff

- Defined the product vision: white-label booking + revenue CRM for small Georgian businesses
- Chose tech stack: Next.js 14, Supabase, Prisma, shadcn/ui, Vercel
- Decided on per-client-instance architecture (not multi-tenant) for MVP
- Set MVP scope: booking form + orders + companies + prices + statistics
- Created Obsidian vault with full strategy, tech, schema, roadmap, and business model docs
- **Next:** scaffold the Next.js repo and connect Supabase
