"use client";

import { useId, useState, type ReactNode } from "react";

export interface PanelTab {
  id: string;
  label: string;
  badge?: string | number;
  content: ReactNode;
}

/** One section visible at a time instead of a long scroll of every section. */
export function PanelTabs({ tabs, initial }: { tabs: PanelTab[]; initial?: string }) {
  const visible = tabs.filter((t) => t.content != null && t.content !== false);
  const [active, setActive] = useState(initial ?? visible[0]?.id);
  const base = useId();
  const current = visible.find((t) => t.id === active) ?? visible[0];
  if (!current) return null;
  return (
    <div className="ptabs">
      <div className="tabs ptabs-bar" role="tablist">
        {visible.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-${t.id}`}
            aria-selected={t.id === current.id}
            aria-controls={`${base}-${t.id}-panel`}
            className="tab"
            onClick={() => setActive(t.id)}
          >
            {t.label}
            {t.badge != null && t.badge !== "" && <span className="ptabs-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-${current.id}-panel`} aria-labelledby={`${base}-${current.id}`} className="ptabs-panel">
        {current.content}
      </div>
    </div>
  );
}
