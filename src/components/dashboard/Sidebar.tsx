"use client";

import { usePathname } from "next/navigation";
import { SidebarNav } from "./SidebarNav";
import { ModuleRail } from "@/components/shell/ModuleRail";
import { moduleForPath } from "@/components/shell/modules";

interface SidebarProps {
  isCollapsed: boolean;
}

export function Sidebar({ isCollapsed }: SidebarProps) {
  const mod = moduleForPath(usePathname());
  return (
    <div className="sidebar-wrap">
      <ModuleRail />
      <aside className="ctx-side" data-collapsed={isCollapsed ? "true" : undefined}>
        {!isCollapsed && (
          <div className="ctx-head" style={{ "--mod-accent": mod.accent } as React.CSSProperties}>
            <span className="ctx-head-name">{mod.name}</span>
            <span className="ctx-head-sub">{mod.subtitle}</span>
          </div>
        )}
        <SidebarNav isCollapsed={isCollapsed} />
      </aside>
    </div>
  );
}
