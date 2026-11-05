"use client";
import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Info, AlertCircle, X } from "lucide-react";

type T = { id: number; kind: "success" | "info" | "danger"; message: string; action?: { label: string; onClick: () => void } };
let items: T[] = [];
const subs = new Set<() => void>();
let n = 0;
const emit = () => subs.forEach((f) => f());

export function toast(kind: T["kind"], message: string, action?: T["action"]) {
  const id = ++n;
  items = [...items.slice(-2), { id, kind, message, action }];
  emit();
  setTimeout(() => dismiss(id), kind === "danger" ? 7000 : 4000);
}
function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const IC = { success: CheckCircle, info: Info, danger: AlertCircle };
const COL = { success: "var(--success)", info: "var(--accent)", danger: "var(--danger)" };

export function Toaster() {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => items, () => items);
  return (
    <div className="toast-stack" aria-live="polite" role="status">
      <AnimatePresence>
        {list.map((t) => {
          const Ic = IC[t.kind];
          return (
            <motion.div key={t.id} className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.18 }} layout>
              <Ic size={16} style={{ color: COL[t.kind], flex: "none" }} aria-hidden />
              <span className="toast-grow">{t.message}</span>
              {t.action && <button className="ll-link" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>{t.action.label}</button>}
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="btn btn-icon btn-sm"><X size={13} /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
