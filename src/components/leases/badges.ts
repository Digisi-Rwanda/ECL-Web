import { addMonths, addDays, monthEnd } from "@/lib/leases/dates";
import { approvedChain, currentPeriod, leaseStatus, pendingVersion, member, todayISO } from "@/lib/leases/model";
import { closeOf, setupStatus } from "@/lib/leases/store";
import type { LeasesState } from "@/lib/leases/types";

export interface InboxItem {
  id: string;
  kind: "review" | "returned" | "setup" | "alert" | "close" | "import";
  title: string;
  detail: string;
  href: string;
  at: string;
  tone: "action" | "info" | "warning";
}

/** Everything that needs the current member, derived from live state (never stored). */
export function inboxFor(st: LeasesState) {
  const me = member(st);
  const today = todayISO();
  const todo: InboxItem[] = [];
  const waiting: InboxItem[] = [];
  const done: InboxItem[] = [];
  const reviewer = me.role === "reviewer" || me.role === "administrator";
  for (const l of st.leases) {
    const v = pendingVersion(l);
    if (v?.status === "in_review") {
      const item: InboxItem = {
        id: `rv-${l.id}`, kind: "review", title: `${l.code} · ${l.name}`, tone: "action",
        detail: `${v.event === "initial" ? "New lease" : `Change: ${v.event}`} · v${v.n} submitted by ${member(st, v.submittedBy!).name}`,
        href: `/leases/${l.id}`, at: v.submittedAt ?? v.createdAt,
      };
      if (v.approverId === me.id) todo.push(item);
      else if (v.submittedBy === me.id) waiting.push({ ...item, tone: "info", detail: `Waiting on ${member(st, v.approverId!).name}` });
    }
    if (v?.status === "returned" && v.createdBy === me.id) {
      const last = [...v.comments].reverse().find((c) => c.kind === "return");
      todo.push({ id: `rt-${l.id}`, kind: "returned", title: `${l.code} · ${l.name} returned`, detail: last?.text ?? "Changes requested", href: `/leases/new?draft=${l.id}`, at: last?.at ?? v.createdAt, tone: "warning" });
    }
    for (const x of l.versions) {
      const c = x.comments.find((k) => (k.kind === "approve" || k.kind === "return") && k.by === me.id);
      if (c) done.push({ id: `dn-${l.id}-${x.n}`, kind: "review", title: `${l.code} · ${l.name}`, detail: `${c.kind === "approve" ? "Approved" : "Returned"} v${x.n}`, href: `/leases/${l.id}`, at: c.at, tone: "info" });
    }
    // alerts for active leases
    const chain = approvedChain(l);
    const status = leaseStatus(l, today);
    if (status === "active" && chain.length) {
      const last = chain[chain.length - 1];
      for (const o of last.assessment.options) {
        if (o.noticeDate && o.noticeDate >= today && o.noticeDate <= addMonths(today, 3)) {
          todo.push({ id: `op-${l.id}-${o.id}`, kind: "alert", title: `Notice deadline ${o.noticeDate}`, detail: `${l.code} · ${l.name}: decide on the ${o.months}-month ${o.type} option`, href: `/leases/${l.id}`, at: o.noticeDate, tone: "warning" });
        }
      }
      if (last.terms.endDate <= addDays(today, 60)) {
        todo.push({ id: `ex-${l.id}`, kind: "alert", title: `Lease ends ${last.terms.endDate}`, detail: `${l.code} · ${l.name}: renew, vacate or record a holdover`, href: `/leases/${l.id}`, at: last.terms.endDate, tone: "warning" });
      }
    }
  }
  if (reviewer) {
    for (const key of ["policies", "curves", "gl"] as const) {
      for (const v of st[key]) {
        if (v.status === "in_review" && v.createdBy !== me.id) {
          todo.push({ id: `su-${key}-${v.version}`, kind: "setup", title: `${key === "gl" ? "GL mapping" : key === "curves" ? "Discount-rate curve" : "Accounting policy"} v${v.version}`, detail: v.reason, href: `/leases/setup/${key === "curves" ? "rates" : key === "gl" ? "gl" : "policy"}`, at: v.createdAt, tone: "action" });
        }
      }
    }
  }
  const p = currentPeriod(st);
  if (p) {
    const c = closeOf(st, p.key);
    const approve = c?.steps.find((x) => x.id === "approve");
    if (reviewer && approve?.status === "todo") {
      const b = st.batches.find((x) => x.id === c!.batchId);
      if (b && b.createdBy !== me.id) todo.push({ id: `cl-${p.key}`, kind: "close", title: `Approve journal batch ${b.id}`, detail: `${p.key} close`, href: `/leases/close/${p.key}`, at: b.createdAt, tone: "action" });
    }
    if (!c && today > monthEnd(p.key) && me.role !== "reviewer") {
      todo.push({ id: `cs-${p.key}`, kind: "close", title: `Start the ${p.key} close`, detail: "The period has ended", href: `/leases/close/${p.key}`, at: monthEnd(p.key), tone: "action" });
    }
  }
  for (const b of st.imports) {
    if (b.status === "validated" && b.createdBy === me.id) todo.push({ id: `im-${b.id}`, kind: "import", title: `Import ${b.id} is validated`, detail: `${b.fileName}: review results and commit`, href: `/leases/imports/${b.id}`, at: b.createdAt, tone: "action" });
  }
  const byDate = (a: InboxItem, b: InboxItem) => (a.at < b.at ? 1 : -1);
  return { todo: todo.sort(byDate), waiting: waiting.sort(byDate), done: done.sort(byDate).slice(0, 50) };
}

export function leaseBadges(st: LeasesState) {
  const me = member(st);
  const inbox = inboxFor(st).todo.length;
  const drafts = st.leases.filter((l) => !approvedChain(l).length && pendingVersion(l)?.status !== "in_review").length;
  const imports = st.imports.filter((b) => b.status === "validating" || b.status === "committing" || b.status === "validated" || b.status === "mapping").length;
  const s = setupStatus(st);
  const setup = Object.values(s).filter((x) => !x).length;
  const p = currentPeriod(st);
  const c = p && closeOf(st, p.key);
  const closeOpen = c ? c.steps.filter((x) => x.status === "todo" || x.status === "running").length : 0;
  return {
    inbox: { n: inbox, tone: "action" as const },
    drafts: { n: drafts, tone: st.leases.some((l) => pendingVersion(l)?.status === "returned" && pendingVersion(l)?.createdBy === me.id) ? ("action" as const) : ("neutral" as const) },
    imports: { n: imports, tone: "neutral" as const },
    setup: { n: setup, tone: "action" as const },
    close: { n: closeOpen, tone: "neutral" as const },
  };
}
