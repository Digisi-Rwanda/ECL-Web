"use client";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { useState } from "react";
import { Btn, TextInput } from "./Kit";

/** Side drawer on desktop, bottom sheet on phones. Keeps the page behind it in view. */
export function Drawer({
  open, onOpenChange, title, sub, children, footer,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="ll-scrim" />
        <D.Content className="ll-sheet" aria-describedby={undefined}>
          <div className="ll-sheet-head">
            <div style={{ flex: 1, minWidth: 0 }}>
              <D.Title asChild><h2>{title}</h2></D.Title>
              {sub && <p>{sub}</p>}
            </div>
            <D.Close className="btn btn-icon" aria-label="Close"><X size={16} /></D.Close>
          </div>
          <div className="ll-sheet-body">{children}</div>
          {footer && <div className="ll-sheet-foot">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Modal({ open, onOpenChange, title, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="ll-scrim" />
        <D.Content className="ll-modal" aria-describedby={undefined}>
          <D.Title asChild><h2>{title}</h2></D.Title>
          {children}
          {footer && <div className="ll-modal-foot">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Confirmation that lists consequences; optional type-to-confirm for irreversible actions. */
export function Confirm({
  open, onOpenChange, title, consequences, confirmLabel, tone = "primary", typeToConfirm, onConfirm, children,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; consequences: React.ReactNode[]; confirmLabel: string;
  tone?: "primary" | "danger"; typeToConfirm?: string; onConfirm: () => Promise<unknown> | void; children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = !typeToConfirm || typed.trim() === typeToConfirm;
  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!busy) { setTyped(""); onOpenChange(o); } }}
      title={title}
      footer={
        <>
          <Btn onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Btn>
          <Btn
            variant={tone}
            disabled={!ok}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(); setTyped(""); onOpenChange(false); } finally { setBusy(false); }
            }}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <ul style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 18, listStyle: "disc", color: "var(--text-muted)", fontSize: "var(--fs-body)" }}>
        {consequences.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
      {children}
      {typeToConfirm && (
        <label className="ll-field">
          <span className="ll-label">Type <strong className="ll-mono" style={{ color: "var(--text)" }}>{typeToConfirm}</strong> to confirm</span>
          <TextInput value={typed} onChange={setTyped} autoComplete="off" autoFocus />
        </label>
      )}
    </Modal>
  );
}
