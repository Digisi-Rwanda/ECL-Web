"use client";
import { useMemo, useState } from "react";
import { Search, Plus, FileUp, Download, FileText, Bookmark, X } from "lucide-react";
import { approvedChain, balancesAt, currentPeriod, fmtDate, leaseStatus, pendingVersion, member, STATUS_META, todayISO, monthEnd, fmtDateTime } from "@/lib/leases/model";
import { saveView, deleteView } from "@/lib/leases/store";
import { toCsv, downloadText } from "@/lib/leases/csv";
import { ASSET_CLASSES, type Lease, type LeaseStatus } from "@/lib/leases/types";
import { PageHeader, Money, BtnLink, Btn, EmptyState, Select, StatusBadge } from "@/components/ll/Kit";
import { DataTable, type Column } from "@/components/ll/DataTable";
import { Modal } from "@/components/ll/Overlay";
import { useLeasesState, useQueryParam, useAction, can } from "../use-leases";
import { LeaseStatusBadge, PersonById, RequireSetup, CLASS_OPTIONS } from "../common";

const FILTERS: Array<{ id: string; label: string; match: (s: LeaseStatus) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "active", label: "Active", match: (s) => s === "active" },
  { id: "review", label: "In review", match: (s) => s === "in_review" },
  { id: "drafts", label: "Drafts", match: (s) => s === "draft" || s === "returned" },
  { id: "future", label: "Not commenced", match: (s) => s === "not_commenced" },
  { id: "exempt", label: "Exempt", match: (s) => s === "exempt" },
  { id: "ended", label: "Ended", match: (s) => s === "expired" || s === "terminated" },
];

interface Row {
  l: Lease;
  status: LeaseStatus;
  lessor: string;
  start: string;
  end: string;
  liability: string;
  rou: string;
  pendingChange: boolean;
}

export function RegisterView({ drafts = false }: { drafts?: boolean }) {
  const st = useLeasesState()!;
  const me = member(st);
  const [q, setQ] = useQueryParam("q");
  const [f, setF] = useQueryParam("status", drafts ? "drafts" : "all");
  const [cls, setCls] = useQueryParam("class");
  const [sortKey, setSortKey] = useQueryParam("sort", drafts ? "updated" : "attention");
  const [dir, setDir] = useQueryParam("dir", drafts ? "desc" : "asc");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [viewName, setViewName] = useState<string | null>(null);
  const { run } = useAction();
  const period = currentPeriod(st);
  const asOf = period ? monthEnd(period.key) : todayISO();

  const rows = useMemo<Row[]>(() => st.leases.map((l) => {
    const chain = approvedChain(l);
    const v = chain.at(-1) ?? l.versions.at(-1)!;
    const b = chain.length ? balancesAt(st, l, asOf) : { liability: "", rou: "" };
    return {
      l, status: leaseStatus(l), lessor: st.counterparties.find((c) => c.id === l.counterpartyId)?.name ?? "—",
      start: (chain[0] ?? v).terms.commencementDate, end: v.terms.endDate, liability: b.liability, rou: b.rou,
      pendingChange: chain.length > 0 && !!pendingVersion(l),
    };
  }), [st, asOf]);

  const filter = FILTERS.find((x) => x.id === f) ?? FILTERS[0];
  const shown = rows.filter((r) => filter.match(r.status) && (!cls || r.l.assetClass === cls) && (!q || `${r.l.code} ${r.l.name} ${r.lessor} ${r.l.location}`.toLowerCase().includes(q.toLowerCase())));
  const attention = (r: Row) => (r.status === "returned" ? 0 : r.status === "in_review" || r.pendingChange ? 1 : r.status === "draft" ? 2 : 3);

  const columns: Column<Row>[] = [
    { key: "lease", header: "Lease", minWidth: 220, sortValue: (r) => r.l.code, cell: (r) => <span style={{ display: "flex", flexDirection: "column" }}><span>{r.l.name}</span><span className="ll-code">{r.l.code}{r.pendingChange ? " · change pending" : ""}</span></span> },
    { key: "lessor", header: "Lessor", sortValue: (r) => r.lessor, cell: (r) => r.lessor },
    { key: "class", header: "Class", sortValue: (r) => r.l.assetClass, cell: (r) => ASSET_CLASSES[r.l.assetClass] },
    { key: "start", header: "Commences", sortValue: (r) => r.start || "9999", cell: (r) => <span className="ll-mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{r.start ? fmtDate(r.start) : "—"}</span> },
    { key: "end", header: "Ends", sortValue: (r) => r.end || "9999", cell: (r) => <span className="ll-mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{r.end ? fmtDate(r.end) : "—"}</span> },
    ...(drafts ? [
      { key: "updated", header: "Last edited", sortValue: (r: Row) => r.l.updatedAt, cell: (r: Row) => <span className="ll-muted" style={{ fontSize: 12 }}>{fmtDateTime(r.l.updatedAt)}</span> },
      { key: "step", header: "Wizard step", cell: (r: Row) => `${Math.min(5, r.l.wizardStep + 1)} of 5` },
    ] : [
      { key: "liability", header: `Liability`, num: true, sortValue: (r: Row) => Number(r.liability || 0), cell: (r: Row) => <Money value={r.liability} dash /> },
      { key: "rou", header: "ROU NBV", num: true, sortValue: (r: Row) => Number(r.rou || 0), cell: (r: Row) => <Money value={r.rou} dash /> },
    ]),
    { key: "status", header: "Status", sortValue: (r) => STATUS_META[r.status].label, cell: (r) => <LeaseStatusBadge status={r.status} /> },
    { key: "owner", header: "Owner", sortValue: (r) => member(st, r.l.ownerId).name, cell: (r) => <PersonById st={st} id={r.l.ownerId} /> },
  ];
  // default "needs attention first" order (returned → in review → drafts → the rest)
  const ordered = sortKey === "attention" ? [...shown].sort((a, b) => (`${attention(a)}${a.l.code}` < `${attention(b)}${b.l.code}` ? -1 : 1)) : shown;

  const href = (r: Row) => (r.status === "draft" || r.status === "returned") ? `/leases/new?draft=${r.l.id}` : `/leases/${r.l.id}`;
  const exportRows = (list: Row[]) => {
    downloadText(`leases_${asOf}.csv`, toCsv([
      ["code", "name", "lessor", "class", "location", "commencement", "end", "status", `liability_${asOf}`, `rou_${asOf}`, "currency"],
      ...list.map((r) => [r.l.code, r.l.name, r.lessor, r.l.assetClass, r.l.location, r.start, r.end, STATUS_META[r.status].label, r.liability, r.rou, r.l.currency]),
    ]));
  };

  return (
    <RequireSetup>
      <PageHeader
        title={drafts ? "Drafts" : "All leases"}
        sub={drafts ? "Leases not yet on the books. Returned drafts need changes before resubmitting." : `${rows.length} leases · balances as at ${fmtDate(asOf)}`}
        actions={
          <>
            <Btn onClick={() => exportRows(shown)} disabled={!shown.length}><Download size={14} /> Export</Btn>
            {can(me.role, "prepare") && <BtnLink href="/leases/imports"><FileUp size={14} /> Import</BtnLink>}
            {can(me.role, "prepare") && <BtnLink href="/leases/new" variant="primary"><Plus size={14} /> New lease</BtnLink>}
          </>
        }
      />
      <div className="ll-card">
        <div className="ll-card-pad ll-stack" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="ll-toolbar">
            <div className="input-wrap">
              <Search className="ic" />
              <input className="input" type="search" placeholder="Search code, name, lessor, location" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leases" />
            </div>
            <div style={{ width: 180 }}><Select value={cls} onChange={setCls} options={[{ value: "", label: "All classes" }, ...CLASS_OPTIONS.map((c) => ({ value: c.value, label: c.label }))]} aria-label="Asset class" /></div>
            {!drafts && <Btn size="sm" variant="ghost" onClick={() => setViewName("")}><Bookmark size={13} /> Save view</Btn>}
          </div>
          {!drafts && (
            <div className="ll-row" role="group" aria-label="Status filter">
              {FILTERS.map((x) => {
                const n = rows.filter((r) => x.match(r.status)).length;
                return <button key={x.id} className="ll-chip" aria-pressed={f === x.id} onClick={() => setF(x.id)}>{x.label} <span className="ll-mono" style={{ opacity: 0.7 }}>{n}</span></button>;
              })}
            </div>
          )}
          {!drafts && st.savedViews.length > 0 && (
            <div className="ll-row">
              <span className="ll-subtle" style={{ fontSize: 12 }}>Saved views:</span>
              {st.savedViews.map((v) => (
                <span key={v.id} className="ll-chip" style={{ paddingRight: 4 }}>
                  <a href={`/leases/register?${v.query}`} className="ll-link" style={{ fontSize: 12 }}>{v.name}</a>
                  <button className="btn btn-icon btn-sm" style={{ height: 20, width: 20 }} aria-label={`Delete view ${v.name}`} onClick={() => run("dv", () => deleteView(v.id))}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
        <DataTable
          caption="Leases"
          rows={ordered}
          columns={columns}
          rowKey={(r) => r.l.id}
          href={href}
          sort={{ key: sortKey, dir: dir as "asc" | "desc" }}
          onSort={(s) => { setSortKey(s.key); setDir(s.dir); }}
          selectable={() => true}
          selected={sel}
          onSelect={setSel}
          bulk={
            <>
              <strong>{sel.size} selected</strong>
              <Btn size="sm" onClick={() => exportRows(shown.filter((r) => sel.has(r.l.id)))}><Download size={13} /> Export selected</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Btn>
              <span className="ll-subtle">Leases on the books can&apos;t be deleted — record a termination instead.</span>
            </>
          }
          card={(r) => ({
            title: <>{r.l.name} <span className="ll-code">{r.l.code}</span></>,
            badge: <LeaseStatusBadge status={r.status} />,
            meta: [r.lessor, r.end ? `Ends ${fmtDate(r.end)}` : "No dates yet", r.liability ? <Money key="m" value={r.liability} /> : <StatusBadge key="s" tone="neutral" dot={false}>Not on books</StatusBadge>],
          })}
          empty={
            rows.length === 0 ? (
              <EmptyState icon={FileText} title={drafts ? "No drafts" : "No leases yet"} body={drafts ? "Leases you start but don't submit appear here." : "Add your first lease or import a portfolio."} actions={can(me.role, "prepare") ? <BtnLink href="/leases/new" variant="primary"><Plus size={14} /> New lease</BtnLink> : undefined} />
            ) : (
              <EmptyState icon={Search} title="No leases match" body="Try a different search or clear the filters." actions={<Btn onClick={() => { setQ(""); setCls(""); setF(drafts ? "drafts" : "all"); }}>Clear filters</Btn>} />
            )
          }
        />
      </div>
      <Modal
        open={viewName !== null}
        onOpenChange={(o) => !o && setViewName(null)}
        title="Save this view"
        footer={<><Btn onClick={() => setViewName(null)}>Cancel</Btn><Btn variant="primary" onClick={async () => { const qs = new URLSearchParams(window.location.search).toString(); const ok = await run("sv", () => saveView(viewName ?? "", qs), "View saved"); if (ok !== undefined) setViewName(null); }}>Save</Btn></>}
      >
        <label className="ll-field"><span className="ll-label">Name</span><input className="input" autoFocus value={viewName ?? ""} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Property ending in 2027" /></label>
      </Modal>
    </RequireSetup>
  );
}
