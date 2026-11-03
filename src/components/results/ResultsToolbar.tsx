"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Layers, Filter, Columns, ChevronDown } from "lucide-react";
import type { ExplorerFilter } from "@/lib/results-types";
import { LOAN_TABLE_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from "@/lib/results-types";

interface ResultsToolbarProps {
  filter: ExplorerFilter;
  rowSummary: string;
  hidden: boolean;
  onChange: (patch: Partial<ExplorerFilter>) => void;
  onClearFilters: () => void;
  showColumns: boolean;
}

export function ResultsToolbar({ filter, rowSummary, hidden, onChange, showColumns }: ResultsToolbarProps) {
  const [stageOpen, setStageOpen] = useState(false);
  const [minEclOpen, setMinEclOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [minEclInput, setMinEclInput] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const minEclRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const activeCount = filter.stageFilters.filter(Boolean).length;
  const minEclActive = filter.minEcl != null && filter.minEcl > 0;
  const visibleCols = filter.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS;
  const hiddenColCount = LOAN_TABLE_COLUMNS.length - visibleCols.length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (stageRef.current && !stageRef.current.contains(e.target as Node)) {
        setStageOpen(false);
      }
      if (minEclRef.current && !minEclRef.current.contains(e.target as Node)) {
        setMinEclOpen(false);
      }
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (minEclOpen) {
      setMinEclInput(filter.minEcl != null ? String(filter.minEcl) : "");
    }
  }, [minEclOpen, filter.minEcl]);

  if (hidden) return null;

  function toggleStage(i: number) {
    const next = [...filter.stageFilters] as [boolean, boolean, boolean];
    next[i] = !next[i];
    // At least one stage stays selected; "none" would only ever show an empty table.
    if (!next.some(Boolean)) return;
    onChange({ stageFilters: next });
  }

  function applyMinEcl() {
    const trimmed = minEclInput.trim();
    if (!trimmed) {
      onChange({ minEcl: undefined });
    } else {
      const val = parseFloat(trimmed);
      if (!Number.isNaN(val) && val >= 0) {
        onChange({ minEcl: val });
      }
    }
    setMinEclOpen(false);
  }

  function clearMinEcl() {
    onChange({ minEcl: undefined });
    setMinEclInput("");
    setMinEclOpen(false);
  }

  function toggleColumn(colId: string) {
    const current = filter.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS;
    const next = current.includes(colId)
      ? current.filter((id) => id !== colId)
      : [...current, colId];
    if (next.length === 0) return;
    onChange({ visibleColumns: next });
  }

  return (
    <div className="rx-toolbar">
      {/* Search */}
      <div className="rx-search">
        <Search size={15} className="rx-search-ic" aria-hidden />
        <input
          type="search"
          placeholder="Search loan or customer…"
          value={filter.search}
          onChange={(e) => onChange({ search: e.target.value })}
          aria-label="Search loans"
        />
      </div>

      {/* Stage filter */}
      <div className="fdrop" ref={stageRef}>
        <button
          className={`fbtn${activeCount < 3 ? " active" : ""}`}
          onClick={() => setStageOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={stageOpen}
        >
          <Layers size={13} aria-hidden />
          Stage
          {activeCount < 3 && (
            <span
              style={{
                background: "var(--accent)", color: "#fff",
                borderRadius: 999, minWidth: 16, height: 16,
                fontSize: 10, display: "grid", placeItems: "center",
                padding: "0 4px",
              }}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown size={13} aria-hidden />
        </button>
        {stageOpen && (
          <div className="menu-pop stage-pop" role="menu">
            {([1, 2, 3] as const).map((s, i) => (
              <label key={s} className="stage-ck-item" role="menuitemcheckbox" aria-checked={filter.stageFilters[i]}>
                <input
                  type="checkbox"
                  className="stage-ck"
                  checked={filter.stageFilters[i]}
                  onChange={() => toggleStage(i)}
                />
                Stage {s}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Min ECL filter */}
      <div className="fdrop" ref={minEclRef}>
        <button
          className={`fbtn${minEclActive ? " active" : ""}`}
          onClick={() => setMinEclOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={minEclOpen}
          aria-label="Filter by minimum ECL"
        >
          <Filter size={13} aria-hidden />
          Min ECL
          {minEclActive && (
            <span
              style={{
                background: "var(--accent)", color: "#fff",
                borderRadius: 999, minWidth: 16, height: 16,
                fontSize: 10, display: "grid", placeItems: "center",
                padding: "0 4px",
              }}
            >
              1
            </span>
          )}
          <ChevronDown size={13} aria-hidden />
        </button>
        {minEclOpen && (
          <div className="menu-pop stage-pop" style={{ minWidth: 200, padding: 10 }}>
            <label style={{ display: "block", fontSize: "var(--fs-caption)", color: "var(--text-muted)", marginBottom: 6 }}>
              Minimum ECL threshold
            </label>
            <input
              type="number"
              min={0}
              step="any"
              value={minEclInput}
              onChange={(e) => setMinEclInput(e.target.value)}
              placeholder="e.g. 1000"
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                fontSize: "var(--fs-body)",
                marginBottom: 8,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyMinEcl();
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="fbtn active" style={{ flex: 1, justifyContent: "center" }} onClick={applyMinEcl}>
                Apply
              </button>
              {minEclActive && (
                <button className="fbtn" style={{ flex: 1, justifyContent: "center" }} onClick={clearMinEcl}>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Columns */}
      {/* Columns choose loan-table columns, so they only exist where a loan table does. */}
      {showColumns && (
      <div className="fdrop" ref={columnsRef}>
        <button
          className={`fbtn${hiddenColCount > 0 ? " active" : ""}`}
          onClick={() => setColumnsOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={columnsOpen}
          aria-label="Manage columns"
        >
          <Columns size={13} aria-hidden />
          Columns
          {hiddenColCount > 0 && (
            <span
              style={{
                background: "var(--accent)", color: "#fff",
                borderRadius: 999, minWidth: 16, height: 16,
                fontSize: 10, display: "grid", placeItems: "center",
                padding: "0 4px",
              }}
            >
              {hiddenColCount}
            </span>
          )}
          <ChevronDown size={13} aria-hidden />
        </button>
        {columnsOpen && (
          <div className="menu-pop stage-pop" role="menu">
            {LOAN_TABLE_COLUMNS.map((col) => (
              <label key={col.id} className="stage-ck-item" role="menuitemcheckbox" aria-checked={visibleCols.includes(col.id)}>
                <input
                  type="checkbox"
                  className="stage-ck"
                  checked={visibleCols.includes(col.id)}
                  onChange={() => toggleColumn(col.id)}
                />
                {col.label}
              </label>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="spacer" />
      <span className="row-summary" aria-live="polite">{rowSummary}</span>
    </div>
  );
}
