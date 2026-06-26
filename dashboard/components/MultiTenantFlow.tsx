'use client'

import { useState, useMemo } from 'react'
import { ReactFlow, Background, Controls, BackgroundVariant, type Node, type Edge, Handle, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type MTNode = {
  id: string
  label: string
  sublabel: string
  type: 'browser' | 'host' | 'middleware' | 'database' | 'action' | 'result'
  detail: string
}

const typeStyles: Record<MTNode['type'], { bg: string; border: string; accent: string; dot: string; tag: string }> = {
  browser:    { bg: 'bg-blue-950',    border: 'border-blue-700',    accent: 'text-blue-300',    dot: 'bg-blue-400',    tag: 'BROWSER' },
  host:       { bg: 'bg-violet-950',  border: 'border-violet-600',  accent: 'text-violet-300',  dot: 'bg-violet-400',  tag: 'HOSTING' },
  middleware: { bg: 'bg-gray-900',    border: 'border-gray-500',    accent: 'text-gray-300',    dot: 'bg-gray-400',    tag: 'MIDDLEWARE' },
  database:   { bg: 'bg-emerald-950', border: 'border-emerald-700', accent: 'text-emerald-300', dot: 'bg-emerald-400', tag: 'DATABASE' },
  action:     { bg: 'bg-amber-950',   border: 'border-amber-700',   accent: 'text-amber-300',   dot: 'bg-amber-400',   tag: 'APP LAYER' },
  result:     { bg: 'bg-teal-950',    border: 'border-teal-700',    accent: 'text-teal-300',    dot: 'bg-teal-400',    tag: 'RESULT' },
}

const MT_NODES: MTNode[] = [
  {
    id: 'browser_a',
    label: 'nikalasmarani.ge',
    sublabel: 'Tenant A visitor',
    type: 'browser',
    detail: `**Any domain can be a tenant.**\n\nA visitor lands on \`nikalasmarani.ge\`. Their browser sends a normal HTTP request with a \`Host: nikalasmarani.ge\` header — this is the only signal that identifies which tenant they belong to.\n\nVercel receives this request and routes it to the same Next.js deployment, regardless of the domain.`,
  },
  {
    id: 'browser_b',
    label: 'winery2.com',
    sublabel: 'Tenant B visitor',
    type: 'browser',
    detail: `**Any domain can be a tenant.**\n\nA visitor lands on \`winery2.com\`. Their browser sends a normal HTTP request with a \`Host: winery2.com\` header.\n\nVercel routes this to the **same Next.js app** as every other tenant. No separate deployment needed. Adding a new tenant = adding their domain in Vercel → Settings → Domains.`,
  },
  {
    id: 'vercel',
    label: 'Vercel',
    sublabel: 'One deployment — all tenants',
    type: 'host',
    detail: `**One app, infinite tenants.**\n\nVercel hosts a single Next.js deployment. All tenant domains point here.\n\nAdding a new client = adding their domain in Vercel Settings → Domains. No new server, no new config file, no new codebase.\n\n**What is shared across all tenants (hardcoded):**\n- The Next.js code and all components\n- The UI layout and page structure\n- The color scheme and fonts\n- The logo *(until theming is implemented)*\n- Social media links\n- The built-in background image set`,
  },
  {
    id: 'proxy',
    label: 'proxy.ts',
    sublabel: 'Reads Host header → resolves tenantId',
    type: 'middleware',
    detail: `**The routing brain.**\n\nNext.js middleware (\`proxy.ts\`) runs on every incoming request before any page or action loads. It reads the \`Host\` header and looks up which tenant owns that domain:\n\n\`\`\`ts\nconst domain = host.split(':')[0]\nconst tenant = await db.tenant.findUnique({ where: { domain } })\n\`\`\`\n\nThe resolved \`tenantId\` is stamped onto the request as an \`x-tenant-id\` header. Every downstream page, server action, and DB query reads this via \`getTenantId()\`.\n\nLookup results are cached in a module-level Map — the DB call only happens once per domain per server process lifecycle.`,
  },
  {
    id: 'tenants_db',
    label: 'tenants table',
    sublabel: 'domain → tenantId registry',
    type: 'database',
    detail: `**The tenant registry.**\n\nOne row per client:\n\n| field | example |\n|---|---|\n| id | cuid |\n| name | Nikalas Marani |\n| domain | nikalasmarani.ge |\n| slug | nikalas |\n\nAdding tenant #50 = **inserting one row here + adding their domain to Vercel**. That is the entire onboarding.\n\nThis table is intentionally not RLS-protected — the middleware reads it as the superuser \`postgres\` role before any tenant context exists. It contains no sensitive per-tenant business data.`,
  },
  {
    id: 'withtenant',
    label: 'withTenantDb()',
    sublabel: 'Every DB query runs inside this',
    type: 'action',
    detail: `**The enforcement wrapper.**\n\nEvery server action and page wraps its DB queries in \`withTenantDb(tenantId, tx => ...)\`:\n\n\`\`\`ts\nreturn db.$transaction(async (tx) => {\n  await tx.$executeRaw\`\n    SELECT set_config('app.tenant_id', ${'{tenantId}'}, true)\n  \`\n  await tx.$executeRaw\`SET LOCAL ROLE app_user\`\n  return fn(tx)\n})\n\`\`\`\n\n**What each line does:**\n1. Sets \`app.tenant_id\` as a Postgres session variable — RLS policies read this\n2. Downgrades the connection from \`postgres\` (superuser, bypasses RLS) to \`app_user\` (subject to RLS)\n3. Runs your actual Prisma queries under the downgraded role\n4. On COMMIT, role and session var auto-revert — no leakage between requests`,
  },
  {
    id: 'rls',
    label: 'Postgres RLS',
    sublabel: 'tenant_isolation policy on all 12 tables',
    type: 'database',
    detail: `**The database safety net.**\n\nEach of the 12 tenanted tables has a \`tenant_isolation\` RLS policy:\n\n\`\`\`sql\nCREATE POLICY tenant_isolation ON "Order"\n  USING (\n    "tenantId" = current_setting('app.tenant_id', true)\n  )\n\`\`\`\n\n\`current_setting('app.tenant_id', true)\` reads the session variable set by \`withTenantDb\`. If the variable is missing, the policy returns NULL — fail-secure.\n\n**Two independent isolation layers:**\n- Layer 1: \`where: { tenantId }\` in every Prisma query (application code)\n- Layer 2: RLS policy enforced by Postgres itself\n\nEven if a bug in application code omits the \`where\` filter, the DB still returns nothing. Both layers must pass.`,
  },
  {
    id: 'data_a',
    label: 'Tenant A data',
    sublabel: 'Orders, settings, content…',
    type: 'result',
    detail: `**Tenant A sees only their rows.**\n\nThe DB contains rows for all tenants, but Tenant A's requests only ever return rows where \`tenantId = 'tenant-a-id'\`.\n\n**What is per-tenant (stored in Supabase, scoped by tenantId):**\n- SiteContent — all page text, headings, nav labels\n- Settings — min guests, payment details, background image paths\n- Companies + Prices — tour operators and pricing tiers\n- Orders + Wine Orders — all bookings\n- Wines, Menu Items, Masterclass Items\n- Blocked Dates\n- Uploaded background images (Supabase Storage, at \`{tenantId}/filename.webp\`)`,
  },
  {
    id: 'data_b',
    label: 'Tenant B data',
    sublabel: 'Completely isolated',
    type: 'result',
    detail: `**Tenant B sees only their rows.**\n\nTenant B's requests return only rows where \`tenantId = 'tenant-b-id'\`. They cannot see Tenant A's orders, companies, settings, or content — even though they share the same Postgres database.\n\n**What is still hardcoded (not yet per-tenant):**\n- Logo file in \`public/\`\n- Color scheme (Tailwind CSS)\n- Social media links (hardcoded in SiteNav)\n- Built-in background image set\n- Fallback text in \`lib/t.ts\`\n\n*These will be resolved when theming is implemented — the \`tenants\` table will gain a \`theme\` JSON column storing logo URL, primary color, and social links, injected as CSS variables.*`,
  },
]

const POSITIONS: Record<string, { x: number; y: number }> = {
  browser_a:  { x: 0,   y: 0 },
  browser_b:  { x: 450, y: 0 },
  vercel:     { x: 175, y: 160 },
  proxy:      { x: 175, y: 320 },
  tenants_db: { x: 175, y: 480 },
  withtenant: { x: 175, y: 640 },
  rls:        { x: 175, y: 800 },
  data_a:     { x: 0,   y: 960 },
  data_b:     { x: 450, y: 960 },
}

const EDGES: Edge[] = [
  { id: 'e-a-vercel',     source: 'browser_a',  target: 'vercel',     animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } },
  { id: 'e-b-vercel',     source: 'browser_b',  target: 'vercel',     animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } },
  { id: 'e-vercel-proxy', source: 'vercel',      target: 'proxy',      style: { stroke: '#4b5563', strokeWidth: 2 } },
  { id: 'e-proxy-tenant', source: 'proxy',       target: 'tenants_db', style: { stroke: '#4b5563', strokeWidth: 2 } },
  { id: 'e-tenant-with',  source: 'tenants_db',  target: 'withtenant', style: { stroke: '#4b5563', strokeWidth: 2 } },
  { id: 'e-with-rls',     source: 'withtenant',  target: 'rls',        style: { stroke: '#4b5563', strokeWidth: 2 } },
  { id: 'e-rls-a',        source: 'rls',         target: 'data_a',     style: { stroke: '#10b981', strokeWidth: 2 } },
  { id: 'e-rls-b',        source: 'rls',         target: 'data_b',     style: { stroke: '#10b981', strokeWidth: 2 } },
]

function MTNodeComponent({ data }: { data: { node: MTNode; isSelected: boolean } }) {
  const { node, isSelected } = data
  const s = typeStyles[node.type]
  return (
    <div className={`
      w-52 rounded-xl border-2 px-5 py-4 cursor-pointer transition-all select-none
      ${s.bg} ${isSelected ? 'border-white shadow-lg shadow-white/10' : s.border}
    `}>
      <Handle type="target" position={Position.Top} className="!bg-gray-600 !border-gray-500" />
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
        <span className={`text-[10px] font-medium uppercase tracking-wider ${s.accent}`}>{s.tag}</span>
      </div>
      <div className="text-white font-bold text-sm leading-tight">{node.label}</div>
      {node.sublabel && <div className="text-gray-400 text-xs mt-1 leading-snug">{node.sublabel}</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !border-gray-500" />
    </div>
  )
}

const nodeTypes = { mt: MTNodeComponent }

export default function MultiTenantFlow() {
  const [selected, setSelected] = useState<MTNode | null>(null)

  const nodes: Node[] = useMemo(() => MT_NODES.map(n => ({
    id: n.id,
    type: 'mt',
    position: POSITIONS[n.id] ?? { x: 0, y: 0 },
    data: { node: n, isSelected: selected?.id === n.id },
  })), [selected])

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    const found = MT_NODES.find(n => n.id === node.id)
    setSelected(prev => prev?.id === found?.id ? null : (found ?? null))
  }

  return (
    <div className="flex-1 relative flex">
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={EDGES}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnScroll
          zoomOnScroll
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1f2937" />
          <Controls className="[&>button]:bg-gray-800 [&>button]:border-gray-700 [&>button]:text-gray-300 [&>button:hover]:bg-gray-700" />
        </ReactFlow>
      </div>

      {/* Detail panel */}
      <div className={`
        absolute top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-800
        transform transition-transform duration-200 overflow-y-auto
        ${selected ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {selected && (
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  {typeStyles[selected.type].tag}
                </p>
                <h2 className="text-white text-xl font-bold">{selected.label}</h2>
                {selected.sublabel && (
                  <p className="text-gray-400 text-sm mt-1">{selected.sublabel}</p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-500 hover:text-white transition-colors mt-1 flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.detail}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
