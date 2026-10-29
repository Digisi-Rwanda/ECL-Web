"use client";

import { Hash } from "lucide-react";
import { CriteriaGroup } from "@/components/runs/new/pd/CriteriaGroup";
import { CriteriaRow } from "@/components/runs/new/pd/CriteriaRow";
import { countPdCriteria } from "@/lib/api/pd-validation";
import type { PdCriterion } from "@/lib/new-run-types";

function countLabel(criteria: PdCriterion[]) {
  const c = countPdCriteria(criteria);
  if (c.blocked) return { label: `${c.blocked} blocking`, cls: "pill-danger" };
  if (c.review) return { label: `${c.passed} passed · ${c.review} to review`, cls: "pill-warning" };
  return { label: "All passed", cls: "pill-success" };
}

/** Format, business and info criteria for one component (LGD or EAD). */
export function Checklist({ criteria, businessSubtitle }: { criteria: PdCriterion[]; businessSubtitle: string }) {
  const structural = criteria.filter((c) => c.category === "structural");
  const business = criteria.filter((c) => c.category === "business");
  const info = criteria.filter((c) => c.category === "info");
  const s = countLabel(structural);
  const b = countLabel(business);
  return (
    <div>
      <CriteriaGroup
        title="Format & completeness checks"
        subtitle={`${structural.length} checks`}
        countLabel={s.label}
        countClassName={s.cls}
        defaultOpen={s.cls !== "pill-success"}
      >
        {structural.map((c) => (
          <CriteriaRow key={c.id} criterion={c} />
        ))}
      </CriteriaGroup>
      {business.length > 0 && (
        <CriteriaGroup title="Business & spec checks" subtitle={businessSubtitle} countLabel={b.label} countClassName={b.cls} defaultOpen>
          {business.map((c) => (
            <CriteriaRow key={c.id} criterion={c} />
          ))}
        </CriteriaGroup>
      )}
      {info.length > 0 && (
        <ul className="ecl-facts" aria-label="Figures">
          {info.map((c) => (
            <li key={c.id}>
              <Hash size={13} aria-hidden="true" />
              <span>
                <b>{c.code} · {c.name}</b> — {c.rationale}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
