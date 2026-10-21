#!/usr/bin/env node
/**
 * Clears Next's build/dev cache (saas/.next) SAFELY. Run with the dev server stopped:
 *   cd saas && node scripts/clear-next-cache.cjs
 *
 * Why a script and not `rm -rf .next`: Turbopack's dev cache holds links (junctions/symlinks) INTO the real
 * node_modules (`.next/dev/node_modules/@prisma/client-…`, `sharp-…`). A recursive delete that follows a link
 * deletes the real packages — it removed ~180 of them once (memory: feedback_windows_junction_delete). This
 * removes every link first (the link only, never its target), checks they are gone, and only then deletes the
 * folder. It refuses to run anywhere but this repo's saas/.next.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const target = path.resolve(__dirname, '..', '.next')
if (path.basename(path.dirname(target)) !== 'saas' || path.basename(target) !== '.next') {
  console.error(`refusing: unexpected target ${target}`); process.exit(1)
}
if (!fs.existsSync(target)) { console.log('.next does not exist — nothing to clear'); process.exit(0) }

const links = []
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (fs.lstatSync(p).isSymbolicLink()) links.push(p) // junctions report as symbolic links in lstat
    else if (e.isDirectory()) walk(p)
  }
}
walk(target)
for (const l of links) {
  try { fs.unlinkSync(l) } catch { fs.rmdirSync(l) } // removes the link itself, never what it points to
}
const left = links.filter(l => { try { fs.lstatSync(l); return true } catch { return false } })
if (left.length) { console.error(`refusing: links still present, not deleting:\n  ${left.join('\n  ')}`); process.exit(1) }

fs.rmSync(target, { recursive: true, force: true })
console.log(`cleared ${target} (${links.length} link(s) removed first; node_modules untouched)`)
