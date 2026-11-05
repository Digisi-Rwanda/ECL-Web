"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { MobileMenu } from "./MobileMenu";
import { useDemo } from "./DemoContext";

export function MarketingNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const { openDemo } = useDemo();

  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 70);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const overHero = isHome && !isScrolled;

  return (
    <>
      <header
        className="fixed top-0 inset-x-0 z-[120] h-16 flex items-center transition-[background,border-color,box-shadow] duration-180"
        style={
          overHero
            ? { background: "transparent", borderBottom: "1px solid transparent" }
            : {
                background: "color-mix(in srgb, var(--bg) 90%, transparent)",
                backdropFilter: "blur(12px)",
                borderBottom: "1px solid var(--border)",
                boxShadow: "var(--shadow-hover)",
              }
        }
      >
        <div
          className="mx-auto flex w-full items-center justify-between"
          style={{ maxWidth: 1140, padding: "0 var(--gutter)" }}
        >
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-base no-underline"
            style={{ color: overHero ? "#fff" : "var(--text)" }}
          >
            <span
              className="size-7 rounded-lg flex items-center justify-center"
              style={{
                background: overHero ? "#fff" : "var(--accent)",
                color: overHero ? "var(--accent)" : "#fff",
              }}
            >
              <Grid3X3 className="size-3.5" />
            </span>
            <span>Ledgerline</span>
          </Link>

          {/* Nav links — hidden on mobile */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: "How it works", href: "/#how" },
              { label: "Modules", href: "/#modules" },
              { label: "Security", href: "/security" },
              { label: "Pricing", href: "/pricing" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-2 rounded-md text-sm font-medium no-underline transition-colors duration-120"
                style={{
                  color: overHero ? "rgba(255,255,255,0.72)" : "var(--text-muted)",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.color = overHero
                    ? "#fff"
                    : "var(--text)";
                  (e.target as HTMLElement).style.background = overHero
                    ? "rgba(255,255,255,0.08)"
                    : "var(--surface-sunken)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.color = overHero
                    ? "rgba(255,255,255,0.72)"
                    : "var(--text-muted)";
                  (e.target as HTMLElement).style.background = "transparent";
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            <Link
              href="/sign-in"
              className="hidden md:inline-flex h-9 px-3.5 items-center gap-1.5 rounded-md text-sm font-medium no-underline transition-colors duration-120"
              style={{ color: overHero ? "rgba(255,255,255,0.8)" : "var(--text-muted)" }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = overHero ? "#fff" : "var(--text)";
                (e.target as HTMLElement).style.background = overHero
                  ? "rgba(255,255,255,0.1)"
                  : "var(--surface-sunken)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = overHero
                  ? "rgba(255,255,255,0.8)"
                  : "var(--text-muted)";
                (e.target as HTMLElement).style.background = "transparent";
              }}
            >
              Sign in
            </Link>

            <Button
              onClick={openDemo}
              size="default"
              className="hidden md:inline-flex"
            >
              Request a demo
            </Button>

            {/* Burger — mobile only */}
            <button
              className="md:hidden size-9 flex items-center justify-center rounded-md transition-colors duration-120"
              style={{ color: overHero ? "#fff" : "var(--text-muted)" }}
              aria-label={isMobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setIsMobileOpen((v) => !v)}
            >
              {isMobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      <MobileMenu
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        onDemo={() => {
          setIsMobileOpen(false);
          openDemo();
        }}
      />
    </>
  );
}
