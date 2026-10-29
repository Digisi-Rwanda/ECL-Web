"use client";

import { useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, i: number) => string;
  label: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  footnote?: string;
}

export function PagedTable<T>({ rows, columns, rowKey, label, pageSize = 20, onRowClick, selectedKey, footnote }: Props<T>) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);
  const slice = rows.slice((safe - 1) * pageSize, safe * pageSize);
  return (
    <div>
      <div className="tbl-wrap">
        <table className="tbl pdts-table" aria-label={label}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.num ? "num" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, i) => {
              const key = rowKey(row, (safe - 1) * pageSize + i);
              return (
                <tr
                  key={key}
                  className={onRowClick ? "ecl-clickable" : undefined}
                  aria-selected={selectedKey === key || undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.num ? "num" : undefined}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="pdts-muted">
                  Nothing to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <span>
          {rows.length ? `Rows ${(safe - 1) * pageSize + 1}–${Math.min(safe * pageSize, rows.length)} of ${rows.length.toLocaleString()}` : ""}
          {footnote ? ` · ${footnote}` : ""}
        </span>
        {pages > 1 && (
          <span className="pdts-pager">
            <button type="button" className="btn btn-secondary btn-sm" disabled={safe === 1} onClick={() => setPage(safe - 1)}>
              Prev
            </button>
            <span>
              Page {safe} of {pages}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={safe === pages} onClick={() => setPage(safe + 1)}>
              Next
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
