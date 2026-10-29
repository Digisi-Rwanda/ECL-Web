"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, ClipboardCheck, File, Clock, Cpu } from "lucide-react";
import { OverviewTab } from "./tabs/OverviewTab";
import { InputsTab } from "./tabs/InputsTab";
import { AuditTab } from "./tabs/AuditTab";
import { EngineTab } from "./tabs/EngineTab";
import { EclReportTab } from "./tabs/EclReportTab";
import { getVisibleTabs, getDefaultTab, TAB_CONFIG } from "@/lib/runs-types";
import type { RunDetail, RunDetailTab } from "@/lib/runs-types";

const ICONS: Record<string, React.ElementType> = {
  BarChart3, ClipboardCheck, File, Clock, Cpu,
};

interface RunDetailTabsProps {
  run: RunDetail;
  onRerun?: () => void;
}

export function RunDetailTabs({ run, onRerun }: RunDetailTabsProps) {
  const visibleTabs = getVisibleTabs(run.status);
  const [activeTab, setActiveTab] = useState<RunDetailTab>(() => getDefaultTab(run.status));

  const tabs = TAB_CONFIG.filter((t) => visibleTabs.includes(t.id));

  return (
    <div>
      {/* Tab bar */}
      <div className="detail-tabs" role="tablist" aria-label="Run details">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.iconName] ?? BarChart3;
          return (
            <button
              key={tab.id}
              role="tab"
              className="detail-tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} className="dt-ic" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className={`tab-panel active`}
          role="tabpanel"
          aria-label={activeTab}
        >
          {activeTab === "overview" && <OverviewTab run={run} />}
          {activeTab === "report"   && <EclReportTab run={run} />}
          {activeTab === "inputs"   && <InputsTab run={run} />}
          {activeTab === "audit"    && <AuditTab run={run} />}
          {activeTab === "engine"   && <EngineTab run={run} onRerun={onRerun} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
