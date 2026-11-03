"use client";

import { useApiSession } from "@/hooks/use-api-session";
import { useState, useEffect } from "react";
import { useTheme } from "@/providers/ThemeProvider";
import { ThemePicker } from "../appearance/ThemePicker";
import type { ThemePref } from "@/lib/settings-types";

interface AppearanceSectionProps {
  onToast: (msg: string, kind?: "success" | "info" | "danger") => void;
}

export function AppearanceSection({ onToast }: AppearanceSectionProps) {
  const { currency } = useApiSession();
  const { theme, setTheme } = useTheme();
  const [density, setDensityState] = useState<"comfortable" | "compact">("comfortable");

  // Sync density from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ecl-density") as "comfortable" | "compact" | null;
      if (saved) setDensityState(saved);
    } catch (_) {}
  }, []);

  const currentTheme = (theme as ThemePref) ?? "light";

  function handleThemeChange(t: ThemePref) {
    setTheme(t);
    onToast(`Theme set to ${t}.`, "info");
  }

  function handleDensityChange(d: "comfortable" | "compact") {
    setDensityState(d);
    document.documentElement.setAttribute("data-density", d);
    try { localStorage.setItem("ecl-density", d); } catch (_) {}
  }

  return (
    <section className="set-sec active" aria-labelledby="appearance-sec-heading">
      {/* Theme card */}
      <div className="set-card">
        <div className="set-card-head">
          <h3 id="appearance-sec-heading">Theme</h3>
          <p>Applies immediately and is saved to this browser.</p>
        </div>
        <div className="set-card-body">
          <ThemePicker value={currentTheme} onChange={handleThemeChange} />
        </div>
      </div>

      {/* Display card */}
      <div className="set-card">
        <div className="set-card-head">
          <h3>Display</h3>
          <p>How dense tables and numbers appear.</p>
        </div>
        <div className="set-card-body">
          <div className="set-row" style={{ borderTop: 0 }}>
            <div className="sr-meta">
              <div className="t">Table density</div>
              <div className="d">Compact fits more rows; comfortable adds breathing room.</div>
            </div>
            <div className="sr-control">
              <div className="density-seg" role="group" aria-label="Table density">
                {(["comfortable", "compact"] as const).map((d) => (
                  <button
                    key={d}
                    aria-pressed={density === d}
                    onClick={() => handleDensityChange(d)}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="set-row">
            <div className="sr-meta">
              <div className="t">Number format</div>
              <div className="d">Figures use tabular, decimal-aligned digits. Currency is set by your tenant.</div>
            </div>
            <div className="sr-control">
              <span className="statpill">
                <span className="k">Currency</span>
                <span className="v">{currency}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
