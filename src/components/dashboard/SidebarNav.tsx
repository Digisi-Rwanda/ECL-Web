"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApiSession } from "@/hooks/use-api-session";
import { moduleForPath, activeHref, type ModuleDef } from "@/components/shell/modules";
import { useModuleBadges } from "@/components/shell/use-module-badges";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  isCollapsed?: boolean;
  onLinkClick?: () => void;
  /** override the module (mobile drawer switcher) */
  module?: ModuleDef;
}

/** Context sidebar: the nav of whichever module the rail has selected. */
export function SidebarNav({ isCollapsed = false, onLinkClick, module }: SidebarNavProps) {
  const pathname = usePathname();
  const mod = module ?? moduleForPath(pathname);
  const { role } = useApiSession();
  const badges = useModuleBadges(mod.id);
  const active = activeHref(mod, pathname);

  return (
    <nav className="ctx-nav" aria-label={`${mod.name} navigation`}>
      {mod.sections.map((section, i) => {
        const items = section.items.filter((it) => !it.roles || !role || it.roles.includes(role as never));
        if (!items.length) return null;
        return (
          <div key={section.title ?? i} className="ctx-section">
            {section.title && !isCollapsed && <p className="ctx-title">{section.title}</p>}
            {items.map((it) => {
              const on = it.href === active;
              const count = it.badge ? badges[it.badge] : undefined;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onLinkClick}
                  className={cn("side-link", on && "active")}
                  aria-current={on ? "page" : undefined}
                  title={isCollapsed ? it.label : undefined}
                >
                  <it.icon size={16} style={{ flexShrink: 0 }} />
                  {!isCollapsed && <span className="truncate">{it.label}</span>}
                  {count && count.n > 0 && (
                    <span
                      className={cn("count-badge", count.tone === "action" && "action", isCollapsed && "collapsed")}
                      aria-label={`${count.n} ${count.tone === "action" ? "need attention" : "items"}`}
                    >
                      {isCollapsed ? "" : count.n}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
