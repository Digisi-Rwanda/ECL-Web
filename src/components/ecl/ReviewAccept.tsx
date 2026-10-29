"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { acceptReview } from "@/lib/api/ecl-validation";
import type { FileInputType } from "@/lib/new-run-types";

interface Props {
  kind: FileInputType;
  reviewCount: number;
  accepted: boolean;
  token: string | null;
  tenantId: string | null;
  runId: string | null;
  onAccepted: (value: boolean) => void;
}

/**
 * Review items are the spec's own adjustments (exclude, treat as 0, lowest
 * value…). They never block, but a person must say they read them; the server
 * records the acceptance and refuses to compute without it.
 */
export function ReviewAccept({ kind, reviewCount, accepted, token, tenantId, runId, onAccepted }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (reviewCount === 0) return null;

  async function toggle(checked: boolean) {
    if (!checked) return onAccepted(false);
    if (!token || !tenantId || !runId) return;
    setSaving(true);
    setError(null);
    try {
      await acceptReview(token, tenantId, runId, kind);
      onAccepted(true);
    } catch {
      setError("Could not record the acceptance. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="callout callout-info" style={{ marginTop: "var(--sp-4)" }}>
      <Info size={15} className="ic" aria-hidden="true" />
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 8 }}>
          {reviewCount} {kind} check{reviewCount === 1 ? "" : "s"} to review. The listed loans are excluded or adjusted
          exactly as described and written to the Exception Report.
        </div>
        <label className="ecl-accept">
          <input type="checkbox" checked={accepted} disabled={saving} onChange={(e) => void toggle(e.target.checked)} />
          I have reviewed the {kind} checks and accept these actions
        </label>
        {error && <p className="pdts-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
