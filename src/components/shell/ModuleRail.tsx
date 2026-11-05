"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Shield, Terminal } from "lucide-react";
import { useApiSession } from "@/hooks/use-api-session";
import { MODULES, moduleForPath, BRAND } from "./modules";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function RailLink({
  href, label, active, accent, dot, children,
}: { href: string; label: string; active: boolean; accent?: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn("rail-btn", active && "active")}
          style={active && accent ? ({ "--rail-accent": accent } as React.CSSProperties) : undefined}
        >
          {children}
          {dot && <span className="rail-dot" aria-hidden="true" />}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ModuleRail({ dots = {} }: { dots?: Partial<Record<string, boolean>> }) {
  const path = usePathname();
  const current = moduleForPath(path);
  const { role, isPlatformAdmin } = useApiSession();

  return (
    <nav className="rail" aria-label="Modules">
      <Link href="/dashboard" className="rail-logo" aria-label={`${BRAND.name} home`}>
        <span aria-hidden="true">L</span>
      </Link>
      <div className="rail-group">
        {MODULES.map((m) => (
          <RailLink
            key={m.id}
            href={m.href}
            label={m.id === "home" ? "Home" : `${m.name} · ${m.subtitle}`}
            active={current.id === m.id && !path.startsWith("/settings") && !path.startsWith("/admin") && !path.startsWith("/platform")}
            accent={m.accent}
            dot={dots[m.id]}
          >
            <m.icon size={18} />
          </RailLink>
        ))}
      </div>
      <div className="rail-group rail-bottom">
        {role !== "reviewer" && (
          <RailLink href="/admin" label="Admin" active={path.startsWith("/admin")}>
            <Shield size={18} />
          </RailLink>
        )}
        <RailLink href="/settings" label="Settings" active={path.startsWith("/settings")}>
          <Settings size={18} />
        </RailLink>
        {isPlatformAdmin && (
          <RailLink href="/platform" label="Platform" active={path.startsWith("/platform")}>
            <Terminal size={18} />
          </RailLink>
        )}
      </div>
    </nav>
  );
}
