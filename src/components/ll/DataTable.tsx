"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Kit";

export interface Column<R> {
  key: string;
  header: string;
  cell: (r: R) => React.ReactNode;
  sortValue?: (r: R) => string | number;
  num?: boolean;
  /** hide on tablet widths to keep the table readable */
  minWidth?: number;
  footer?: React.ReactNode;
}

export interface DataTableProps<R> {
  rows: R[];
  columns: Column<R>[];
  rowKey: (r: R) => string;
  href?: (r: R) => string;
  card?: (r: R) => { title: React.ReactNode; badge?: React.ReactNode; meta: React.ReactNode[] };
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (s: { key: string; dir: "asc" | "desc" }) => void;
  selectable?: (r: R) => boolean;
  selected?: Set<string>;
  onSelect?: (s: Set<string>) => void;
  bulk?: React.ReactNode;
  empty?: React.ReactNode;
  loading?: boolean;
  pageSize?: number;
  caption: string;
  rowClass?: (r: R) => string | undefined;
  footer?: boolean;
}

export function DataTable<R>({
  rows, columns, rowKey, href, card, sort, onSort, selectable, selected, onSelect, bulk, empty, loading, pageSize = 25, caption, rowClass, footer,
}: DataTableProps<R>) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sortValue) return rows;
    const f = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return sort!.dir === "desc" ? out.reverse() : out;
  }, [rows, columns, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, (p + 1) * pageSize);
  const selectableRows = selectable ? view.filter(selectable) : [];
  const allOn = selectableRows.length > 0 && selectableRows.every((r) => selected?.has(rowKey(r)));

  if (loading) return <div className="ll-card-pad ll-stack">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={18} />)}</div>;
  if (!rows.length) return <>{empty}</>;

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onSelect?.(s);
  };

  return (
    <div>
      {selected && selected.size > 0 && <div className="ll-bulkbar" role="region" aria-label="Bulk actions">{bulk}</div>}
      <div className={cn("ll-table-wrap", card && "responsive")}>
        <table className="ll-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selectable && (
                <th className="sel">
                  <input type="checkbox" aria-label="Select all on this page" checked={allOn} onChange={() => {
                    const s = new Set(selected);
                    for (const r of selectableRows) {
                      if (allOn) s.delete(rowKey(r));
                      else s.add(rowKey(r));
                    }
                    onSelect?.(s);
                  }} />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={c.num ? "num" : undefined} style={c.minWidth ? { minWidth: c.minWidth } : undefined} aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.sortValue && onSort ? (
                    <button type="button" className="sort-btn" aria-pressed={sort?.key === c.key} onClick={() => onSort({ key: c.key, dir: sort?.key === c.key && sort.dir === "asc" ? "desc" : "asc" })}>
                      {c.header}
                      {sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const id = rowKey(r);
              const h = href?.(r);
              return (
                <tr
                  key={id}
                  className={cn(h && "clickable", rowClass?.(r))}
                  aria-selected={selected?.has(id) || undefined}
                  onClick={h ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input,select,label")) router.push(h); } : undefined}
                >
                  {selectable && (
                    <td className="sel">
                      {selectable(r) && <input type="checkbox" aria-label={`Select ${id}`} checked={!!selected?.has(id)} onChange={() => toggle(id)} />}
                    </td>
                  )}
                  {columns.map((c, i) => (
                    <td key={c.key} className={c.num ? "num" : undefined}>
                      {i === 0 && h ? <Link href={h} className="ll-link" style={{ fontWeight: 500 }}>{c.cell(r)}</Link> : c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer && (
            <tfoot>
              <tr>
                {selectable && <td />}
                {columns.map((c) => <td key={c.key} className={c.num ? "num" : undefined}>{c.footer}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {card && (
        <div className="ll-cards">
          {view.map((r) => {
            const c = card(r);
            const h = href?.(r);
            const inner = (
              <>
                <div className="top"><span className="title">{c.title}</span>{c.badge}</div>
                <div className="meta">{c.meta.map((m, i) => <span key={i}>{m}</span>)}</div>
              </>
            );
            return h ? <Link key={rowKey(r)} href={h} className="ll-cardrow">{inner}</Link> : <div key={rowKey(r)} className="ll-cardrow">{inner}</div>;
          })}
        </div>
      )}
      {pages > 1 && (
        <div className="ll-table-foot">
          <span>{p * pageSize + 1}–{Math.min(sorted.length, (p + 1) * pageSize)} of {sorted.length}</span>
          <span className="ll-row">
            <button className="btn btn-secondary btn-sm" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
            <span>Page {p + 1} of {pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
          </span>
        </div>
      )}
    </div>
  );
}
