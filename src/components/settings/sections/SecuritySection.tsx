"use client";

import { useState } from "react";
import { Lock, Shield, Eye, EyeOff, AlertCircle } from "lucide-react";
import { scorePassword } from "@/lib/use-password-strength";
import { updatePassword } from "@/lib/api/settings";
import { ApiError } from "@/lib/api/client";

interface SecuritySectionProps {
  token?: string;
  onToast: (msg: string, kind?: "success" | "info" | "danger") => void;
}

export function SecuritySection({ token, onToast }: SecuritySectionProps) {
  const [curPw,  setCurPw]  = useState("");
  const [newPw,  setNewPw]  = useState("");
  const [confPw, setConfPw] = useState("");
  const [showCur,  setShowCur]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const strength = scorePassword(newPw, ["mwangi", "tendai", "savanna"]);
  const mismatch = confPw.length > 0 && newPw !== confPw;
  const canSubmit = curPw.length > 0 && strength.score >= 3 && newPw === confPw && confPw.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;
    setSubmitting(true);
    try {
      await updatePassword(token, { current_password: curPw, new_password: newPw });
      setCurPw(""); setNewPw(""); setConfPw("");
      onToast("Password updated.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to update password.";
      onToast(msg, "danger");
    } finally {
      setSubmitting(false);
    }
  }

  const strengthClass = newPw ? `strength s${Math.max(strength.score, 1)}` : "strength";

  return (
    <section className="set-sec active" aria-labelledby="security-sec-heading">
      {/* Password card */}
      <div className="set-card">
        <div className="set-card-head">
          <h3 id="security-sec-heading">Password</h3>
          <p>Use a strong password you don&apos;t reuse elsewhere.</p>
        </div>
        <div className="set-card-body">
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)", maxWidth: 420 }} noValidate>
            {/* Current password */}
            <div className="field">
              <label htmlFor="pw-cur" style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", fontWeight: "var(--fw-medium)" }}>Current password</label>
              <div className="input-wrap">
                <Lock size={15} className="ic" aria-hidden />
                <input id="pw-cur" className="input has-suffix" type={showCur ? "text" : "password"} value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" style={{ paddingRight: 40 }} />
                <button type="button" className="ic-suffix" onClick={() => setShowCur((v) => !v)} aria-label={showCur ? "Hide" : "Show"} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: 0, background: "none", cursor: "pointer", color: "var(--text-subtle)", display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: "var(--r-sm)" }}>
                  {showCur ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="field">
              <label htmlFor="pw-new" style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", fontWeight: "var(--fw-medium)" }}>New password</label>
              <div className="input-wrap">
                <Lock size={15} className="ic" aria-hidden />
                <input id="pw-new" className="input has-suffix" type={showNew ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" style={{ paddingRight: 40 }} />
                <button type="button" className="ic-suffix" onClick={() => setShowNew((v) => !v)} aria-label={showNew ? "Hide" : "Show"} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: 0, background: "none", cursor: "pointer", color: "var(--text-subtle)", display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: "var(--r-sm)" }}>
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {/* Strength meter */}
              <div className={strengthClass} aria-label={`Password strength: ${strength.label || "not entered"}`}>
                {[...Array(5)].map((_, i) => <span key={i} className="seg" />)}
              </div>
              <div className={`strength-label${strength.labelClass ? ` ${strength.labelClass}` : ""}`}>
                {strength.label || " "}
              </div>
            </div>

            {/* Confirm */}
            <div className="field">
              <label htmlFor="pw-conf" style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", fontWeight: "var(--fw-medium)" }}>Confirm new password</label>
              <div className="input-wrap">
                <Lock size={15} className="ic" aria-hidden />
                <input id="pw-conf" className={`input${mismatch ? " is-error" : ""}`} type="password" value={confPw} onChange={(e) => setConfPw(e.target.value)} autoComplete="new-password" />
              </div>
              {mismatch && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-caption)", color: "var(--danger)", marginTop: 4 }}>
                  <AlertCircle size={12} aria-hidden /> Passwords don't match.
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              style={{
                alignSelf: "flex-start", height: "var(--control-h)", padding: "0 16px",
                border: "none", borderRadius: "var(--r-sm)",
                background: canSubmit ? "var(--accent)" : "var(--surface-sunken)",
                color: canSubmit ? "#fff" : "var(--text-subtle)",
                fontSize: "var(--fs-body)", fontWeight: "var(--fw-medium)",
                cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                transition: "background var(--t-micro), color var(--t-micro)",
              }}
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>

      {/* 2FA card */}
      <div className="set-card">
        <div className="set-card-head">
          <h3>Two-factor authentication</h3>
          <p>An extra step at sign-in for added security.</p>
        </div>
        <div className="set-card-body">
          <div className="twofa-card">
            <div className="tf-ic"><Shield size={20} style={{ color: "var(--text-subtle)" }} aria-hidden /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "var(--fw-medium)", display: "flex", alignItems: "center", gap: 8 }}>
                Authenticator app
                <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", fontSize: "var(--fs-micro)", color: "var(--text-subtle)", fontWeight: "var(--fw-medium)" }}>Coming soon</span>
              </div>
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", marginTop: 2 }}>Time-based one-time codes will be available in a future release.</div>
            </div>
            <label className="switch" style={{ flexShrink: 0 }}>
              <input type="checkbox" disabled />
              <span className="track" style={{ opacity: 0.5, cursor: "not-allowed" }} />
            </label>
          </div>
          <p style={{ marginTop: 12, fontSize: "var(--fs-caption)", color: "var(--text-subtle)", lineHeight: 1.5 }}>
            Ledgerline uses email + password sign-in. There's no social login (Google/GitHub); Enterprise tenants can enable SAML/OIDC single sign-on.
          </p>
        </div>
      </div>
    </section>
  );
}
