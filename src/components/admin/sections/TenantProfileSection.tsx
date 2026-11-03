"use client";

import { Building, AlertTriangle, Ban } from "lucide-react";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import type { TenantProfile, ModalKind } from "@/lib/admin-types";
import { CURRENCIES } from "@/lib/currencies";

// Every IANA zone the browser knows; the API validates against the same database.
const TIME_ZONES: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

interface TenantProfileSectionProps {
  profile: TenantProfile;
  modal: ModalKind;
  onUpdate: (p: TenantProfile) => void;
  onMarkDirty: () => void;
  onToast: (msg: string, kind?: "success" | "info" | "danger") => void;
  onSetModal: (m: ModalKind) => void;
  onCloseTenant?: () => Promise<void>;
}

export function TenantProfileSection({
  profile, modal, onUpdate, onMarkDirty, onToast, onSetModal, onCloseTenant,
}: TenantProfileSectionProps) {
  async function handleCloseTenant() {
    try {
      if (onCloseTenant) await onCloseTenant();
      else onToast("Closure request sent to Super Admin.", "info");
      onSetModal(null);
    } catch {
      onToast("Failed to submit closure request.", "danger");
    }
  }

  return (
    <section className="admin-sec active" aria-labelledby="profile-heading">
      <div className="sec-title-row">
        <div>
          <h2 id="profile-heading">Tenant profile</h2>
          <p className="desc">Your institution's identity and reporting settings.</p>
        </div>
      </div>
      <hr className="sec-divider" />

      <div className="profile-grid admin-editable">
        {/* Institution name */}
        <div className="field">
          <label htmlFor="p-name" style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", fontWeight: "var(--fw-medium)" }}>Institution name</label>
          <div className="input-wrap">
            <Building size={15} className="ic" aria-hidden />
            <input
              id="p-name"
              className="input"
              value={profile.name}
              onChange={(e) => { onUpdate({ ...profile, name: e.target.value }); onMarkDirty(); }}
            />
          </div>
        </div>

        {/* Reporting cadence */}
        <div className="field">
          <label htmlFor="p-cadence" style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", fontWeight: "var(--fw-medium)" }}>Reporting cadence</label>
          <select
            id="p-cadence"
            className="select"
            value={profile.reportingCadence}
            onChange={(e) => { onUpdate({ ...profile, reportingCadence: e.target.value as TenantProfile["reportingCadence"] }); onMarkDirty(); }}
          >
            <option>Monthly</option>
            <option>Quarterly</option>
          </select>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-subtle)", marginTop: 4, display: "block" }}>Used for reminders only.</span>
        </div>

        {/* Currency — default for new runs; each run keeps its own */}
        <div className="field">
          <label htmlFor="p-cur" style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", fontWeight: "var(--fw-medium)" }}>Default currency</label>
          <select
            id="p-cur"
            className="select"
            value={profile.currency}
            onChange={(e) => { onUpdate({ ...profile, currency: e.target.value }); onMarkDirty(); }}
          >
            {(CURRENCIES.includes(profile.currency) ? CURRENCIES : [profile.currency, ...CURRENCIES]).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-subtle)", marginTop: 4, display: "block" }}>Used for new runs. Existing runs keep the currency they were computed in.</span>
        </div>

        {/* Time zone */}
        <div className="field">
          <label htmlFor="p-tz" style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", fontWeight: "var(--fw-medium)" }}>Time zone</label>
          <select
            id="p-tz"
            className="select"
            value={profile.timezone}
            onChange={(e) => { onUpdate({ ...profile, timezone: e.target.value }); onMarkDirty(); }}
          >
            {(TIME_ZONES.includes(profile.timezone) ? TIME_ZONES : [profile.timezone, ...TIME_ZONES]).map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </select>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-subtle)", marginTop: 4, display: "block" }}>Used to display dates and times.</span>
        </div>
      </div>

      {/* Danger zone */}
      <div className="danger-zone admin-editable">
        <div className="dz-head">
          <AlertTriangle size={14} aria-hidden /> Danger zone
        </div>
        <div className="dz-row">
          <div>
            <div className="dz-t">Transfer ownership</div>
            <div className="dz-d">Make another Admin the primary owner of this tenant.</div>
          </div>
          <button
            onClick={() => onToast("Transfer ownership — coming soon.", "info")}
            style={{ height: 32, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)", background: "var(--surface)", color: "var(--text)", fontSize: "var(--fs-caption)", fontWeight: "var(--fw-medium)", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Transfer
          </button>
        </div>
        <div className="dz-row">
          <div>
            <div className="dz-t">Close tenant</div>
            <div className="dz-d">Schedule deletion. Runs are retained for 7 years per the audit policy. Requires Super Admin approval.</div>
          </div>
          <button
            onClick={() => onSetModal({ type: "close-tenant" })}
            style={{ height: 32, padding: "0 12px", border: "none", borderRadius: "var(--r-sm)", background: "var(--danger)", color: "#fff", fontSize: "var(--fs-caption)", fontWeight: "var(--fw-medium)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
          >
            <Ban size={13} aria-hidden /> Request closure
          </button>
        </div>
      </div>

      {/* Close tenant confirm */}
      <ConfirmModal
        open={modal?.type === "close-tenant"}
        onClose={() => onSetModal(null)}
        onConfirm={handleCloseTenant}
        title="Request tenant closure"
        description={
          <span>This sends a closure request to a Super Admin. Runs and audit records are retained for 7 years. Type <strong>CLOSE</strong> to confirm.</span>
        }
        icon={
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--danger-subtle)", color: "var(--danger)", display: "grid", placeItems: "center" }}>
            <Ban size={20} aria-hidden />
          </div>
        }
        primaryLabel="Request closure"
        primaryVariant="danger"
        confirmInput="CLOSE"
      />
    </section>
  );
}
