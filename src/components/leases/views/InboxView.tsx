"use client";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Bell, Clock } from "lucide-react";
import { fmtDateTime, persona } from "@/lib/leases/model";
import { markNotificationsRead } from "@/lib/leases/store";
import { PageHeader, Card, Tabs, EmptyState, StatusBadge, Btn } from "@/components/ll/Kit";
import { useLeasesState, useQueryParam } from "../use-leases";
import { inboxFor, type InboxItem } from "../badges";

const KIND: Record<InboxItem["kind"], string> = { review: "Review", returned: "Returned", setup: "Setup", alert: "Alert", close: "Close", import: "Import" };

export function InboxView() {
  const st = useLeasesState()!;
  const me = persona(st);
  const [tab, setTab] = useQueryParam("tab", "todo");
  const box = inboxFor(st);
  const notes = st.notifications.filter((n) => n.to === me.id || n.to === "*" || (n.to === "*reviewer" && me.role !== "analyst"));
  const unread = notes.filter((n) => !n.read);
  const list = tab === "waiting" ? box.waiting : tab === "done" ? box.done : box.todo;
  return (
    <>
      <PageHeader title="Inbox" sub={`Everything waiting for ${me.name} (${me.role === "analyst" ? "preparer" : me.role}).`} />
      <Tabs label="Inbox" value={tab as "todo" | "waiting" | "done" | "notifications"} onChange={setTab} tabs={[
        { id: "todo", label: "To do", count: box.todo.length },
        { id: "waiting", label: "Waiting on others", count: box.waiting.length },
        { id: "done", label: "Done" },
        { id: "notifications", label: "Notifications", count: unread.length || undefined },
      ]} />
      {tab === "notifications" ? (
        <Card title="Notifications" actions={unread.length ? <Btn size="sm" variant="ghost" onClick={() => markNotificationsRead(notes.map((n) => n.id))}>Mark all read</Btn> : undefined} pad={false}>
          {notes.length === 0 ? <EmptyState icon={Bell} title="No notifications" /> : (
            <ul>{notes.map((n) => (
              <li key={n.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <Link href={n.href} onClick={() => markNotificationsRead([n.id])} className="ll-row" style={{ padding: "12px 16px", textDecoration: "none", color: "inherit", flexWrap: "nowrap", background: n.read ? undefined : "var(--accent-subtle)" }}>
                  <Bell size={14} className="ll-subtle" />
                  <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontWeight: n.read ? 500 : 600 }}>{n.title}</strong><span className="ll-muted" style={{ fontSize: 12 }}>{n.body}</span></span>
                  <span className="ll-subtle" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtDateTime(n.at)}</span>
                </Link>
              </li>
            ))}</ul>
          )}
        </Card>
      ) : (
        <Card pad={false}>
          {list.length === 0 ? (
            <EmptyState icon={tab === "waiting" ? Clock : CheckCircle2} title={tab === "todo" ? "You're all caught up" : tab === "waiting" ? "Nothing waiting on others" : "Nothing done yet"} body={tab === "todo" ? "New reviews, returned drafts, alerts and close tasks will appear here." : undefined} />
          ) : (
            <ul>
              {list.map((i) => (
                <li key={i.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <Link href={i.href} className="ll-row" style={{ padding: "14px 16px", textDecoration: "none", color: "inherit", flexWrap: "nowrap" }}>
                    <StatusBadge tone={i.tone === "warning" ? "warning" : i.tone === "action" ? "info" : "neutral"} dot={false}>{KIND[i.kind]}</StatusBadge>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 500 }}>{i.title}</span>
                      <span className="ll-muted" style={{ fontSize: 13 }}>{i.detail}</span>
                    </span>
                    <span className="ll-subtle" style={{ fontSize: 11, whiteSpace: "nowrap" }} >{i.at.length > 10 ? fmtDateTime(i.at) : i.at}</span>
                    <ArrowRight size={14} className="ll-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <p className="ll-subtle" style={{ fontSize: 12 }}>Approvals are opened one at a time on purpose: each lease, change and journal batch needs its schedules looked at, so there is no bulk approve.</p>
    </>
  );
}
