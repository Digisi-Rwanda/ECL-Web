"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, Settings, Shield, Terminal } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { MODULES, moduleForPath, BRAND } from "@/components/shell/modules";
import { useApiSession } from "@/hooks/use-api-session";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const path = usePathname();
  // module the user tapped in the switcher; null = follow the current page
  const [picked, setPicked] = useState<string | null>(null);
  const modId = picked ?? moduleForPath(path).id;
  const { role, isPlatformAdmin } = useApiSession();
  const close = () => { setPicked(null); onClose(); };
  const mod = MODULES.find((m) => m.id === modId) ?? MODULES[0];
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim */}
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--scrim)",
              zIndex: 40,
            }}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              height: "100%",
              width: "min(300px, 86vw)",
              background: "var(--surface)",
              borderRight: "1px solid var(--border)",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              padding: "12px 10px",
              boxShadow: "var(--shadow-modal)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {/* Header row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 8px 14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className="rail-logo" aria-hidden="true"><span>L</span></span>
                <span
                  style={{
                    fontWeight: "var(--fw-semibold)" as React.CSSProperties["fontWeight"],
                    fontSize: "var(--fs-body)",
                    color: "var(--text)",
                  }}
                >
                  {BRAND.name}
                </span>
              </div>

              <button
                onClick={close}
                aria-label="Close menu"
                style={{
                  width: 32,
                  height: 32,
                  border: 0,
                  background: "none",
                  color: "var(--text-subtle)",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "var(--r-sm)",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="seg seg-fill" role="group" aria-label="Module">
              {MODULES.map((m) => (
                <button
                  key={m.id}
                  aria-pressed={m.id === modId}
                  onClick={() => setPicked(m.id)}
                >
                  <m.icon size={14} /> {m.name}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", marginTop: 8 }}>
              <SidebarNav onLinkClick={close} module={mod} />
            </div>
            <div className="drawer-foot">
              {role !== "reviewer" && <Link href="/admin" onClick={close} className="side-link"><Shield size={16} /> Admin</Link>}
              <Link href="/settings" onClick={close} className="side-link"><Settings size={16} /> Settings</Link>
              {isPlatformAdmin && <Link href="/platform" onClick={close} className="side-link"><Terminal size={16} /> Platform</Link>}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
