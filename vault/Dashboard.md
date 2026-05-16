---
tags: [tool, dashboard]
---

# Project Dashboard

A standalone local web app that visualises this vault as an interactive flowchart. Lives at `claude-projects/project-dashboard/`.

## How to run

```bash
cd C:\Users\Max\Desktop\claude-projects\project-dashboard
npm run dev
```

Then open `http://localhost:3000` in Chrome.

## How it works

- Reads this vault's `.md` files on every page load — no manual sync needed
- **Source files used:**
  - `Roadmap.md` → phase and section structure, task checkboxes
  - `MVP Features.md` → detail content shown in the side panel
  - `Progress Log.md` → "last updated" date in the top bar

## Navigation

| Action | Result |
|---|---|
| Click a phase node | Drills into that phase's sections |
| Click a section node | Opens detail panel (right side) with tasks + markdown |
| Click ← Overview (top-left) | Returns to the 4-phase overview |
| Scroll wheel | Zoom in/out |
| Click + drag canvas | Pan |
| × button on panel | Closes detail panel |

## Updating the dashboard

You never need to touch the dashboard code. Just edit the vault files in Obsidian:
- Check off tasks with `[x]` → progress bars update on next refresh
- Add new sections under a phase heading → new nodes appear
- Edit content under a heading → detail panel content updates

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (Turbopack) |
| Graph | React Flow (`@xyflow/react`) |
| Markdown render | react-markdown + remark-gfm |
| Styling | Tailwind CSS |
| Data | Reads local `.md` files via Node.js `fs` |

## Related

- [[Roadmap]]
- [[MVP Features]]
- [[Progress Log]]
