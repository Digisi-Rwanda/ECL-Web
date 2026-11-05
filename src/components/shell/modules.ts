import {
  Home, Activity, BarChart3, FilePlus2, LayoutGrid, Inbox, FileText, FileStack,
  Upload, CalendarCheck, BookOpen, PieChart, SlidersHorizontal, Landmark, Building2,
  type LucideIcon,
} from "lucide-react";

export const BRAND = { name: "Ledgerline", tagline: "IFRS reporting workspace" } as const;

export type ModuleId = "home" | "ecl" | "leases";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** key into the badge map supplied by the module (counts that need action) */
  badge?: string;
  /** exact match only (for index routes) */
  exact?: boolean;
  roles?: Array<"administrator" | "analyst" | "reviewer">;
}
export interface NavSection { title?: string; items: NavItem[] }

export interface ModuleDef {
  id: ModuleId;
  name: string;
  subtitle: string;
  href: string;
  match: (path: string) => boolean;
  icon: LucideIcon;
  /** CSS colour token for the rail tile + module header */
  accent: string;
  sections: NavSection[];
}

export const MODULES: ModuleDef[] = [
  {
    id: "home",
    name: "Home",
    subtitle: "All modules",
    href: "/dashboard",
    match: (p) => p === "/dashboard" || p.startsWith("/settings") || p.startsWith("/admin") || p.startsWith("/platform"),
    icon: Home,
    accent: "var(--accent)",
    sections: [{ items: [{ href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true }] }],
  },
  {
    id: "ecl",
    name: "Credit Loss",
    subtitle: "IFRS 9 · ECL",
    href: "/ecl/runs",
    match: (p) => p.startsWith("/ecl"),
    icon: Activity,
    accent: "var(--accent)",
    sections: [
      {
        items: [
          { href: "/ecl/runs", label: "Runs", icon: Activity },
          { href: "/ecl/runs/new", label: "New run", icon: FilePlus2, exact: true, roles: ["administrator", "analyst"] },
          { href: "/ecl/results", label: "Results", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "leases",
    name: "Leases",
    subtitle: "IFRS 16",
    href: "/leases",
    match: (p) => p.startsWith("/leases"),
    icon: Building2,
    accent: "var(--module-leases)",
    sections: [
      {
        items: [
          { href: "/leases", label: "Overview", icon: LayoutGrid, exact: true },
          { href: "/leases/inbox", label: "Inbox", icon: Inbox, badge: "inbox" },
        ],
      },
      {
        title: "Register",
        items: [
          { href: "/leases/register", label: "All leases", icon: FileText },
          { href: "/leases/drafts", label: "Drafts", icon: FileStack, badge: "drafts" },
          { href: "/leases/imports", label: "Imports", icon: Upload, badge: "imports" },
        ],
      },
      {
        title: "Accounting",
        items: [
          { href: "/leases/close", label: "Period close", icon: CalendarCheck, badge: "close" },
          { href: "/leases/journals", label: "Journals", icon: BookOpen },
          { href: "/leases/reports", label: "Reports", icon: PieChart },
        ],
      },
      {
        title: "Setup",
        items: [
          { href: "/leases/setup", label: "Setup", icon: SlidersHorizontal, badge: "setup" },
          { href: "/leases/setup/rates", label: "Discount rates", icon: Landmark },
        ],
      },
    ],
  },
];

export function moduleForPath(path: string): ModuleDef {
  return MODULES.find((m) => m.id !== "home" && m.match(path)) ?? MODULES[0];
}

function matches(item: NavItem, path: string): boolean {
  if (item.exact) return path === item.href;
  return path === item.href || path.startsWith(item.href + "/");
}

/** Most specific nav href for the path, so /leases/setup/rates doesn't also light up /leases/setup. */
export function activeHref(mod: ModuleDef, path: string): string | undefined {
  return mod.sections
    .flatMap((s) => s.items)
    .filter((i) => matches(i, path))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
