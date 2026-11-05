"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { GlimpseCard } from "./GlimpseCard";
import { useDemo } from "./DemoContext";

const nodes = [
  { top: "18%", left: "12%" },
  { top: "62%", left: "7%" },
  { top: "35%", left: "88%" },
  { top: "75%", left: "82%" },
  { top: "10%", left: "65%" },
];

const stats = [
  { v: "< 5 min", k: "Time to first run" },
  { v: "100%", k: "Deterministic output" },
  { v: "7 yr", k: "Audit trail retention" },
];

export function HeroSection() {
  const nodesRef = useRef<(HTMLSpanElement | null)[]>([]);
  const { openDemo } = useDemo();

  useEffect(() => {
    let gsap: typeof import("gsap").gsap | undefined;
    let ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger | undefined;

    async function initGsap() {
      const g = await import("gsap");
      const st = await import("gsap/ScrollTrigger");
      gsap = g.gsap;
      ScrollTrigger = st.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);

      nodesRef.current.forEach((node, i) => {
        if (!node) return;
        gsap!.to(node, {
          y: -30 - i * 12,
          opacity: 0.15,
          ease: "none",
          scrollTrigger: {
            trigger: node.parentElement,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
      });
    }

    initGsap();
    return () => {
      ScrollTrigger?.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "#0B0C1A",
        color: "#ECEDF5",
        paddingTop: 132,
        paddingBottom: "clamp(64px, 9vw, 104px)",
      }}
    >
      {/* Blueprint grid background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,108,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(139,108,255,0.09) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 90% 75% at 50% 35%, #000 30%, transparent 78%)",
        }}
      />

      {/* Decorative nodes */}
      {nodes.map((pos, i) => (
        <span
          key={i}
          ref={(el) => { nodesRef.current[i] = el; }}
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            top: pos.top,
            left: pos.left,
            width: 6,
            height: 6,
            borderRadius: 1,
            background: "rgba(79,212,230,0.55)",
          }}
        />
      ))}

      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 var(--gutter)", position: "relative" }}>
        <div
          className="grid items-center gap-x-[clamp(32px,5vw,64px)] hero-grid"
          style={{ gridTemplateColumns: "1.05fr 0.95fr" }}
        >
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p
              className="text-xs uppercase tracking-widest mb-3.5 font-medium"
              style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", letterSpacing: "0.18em" }}
            >
              IFRS 9 · IFRS 16 · One ledger of record
            </p>

            <h1
              className="font-semibold"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.4rem, 1.6rem + 3.4vw, 3.6rem)",
                lineHeight: 1.06,
                letterSpacing: "-0.02em",
                color: "#fff",
              }}
            >
              Credit loss and leases,{" "}
              <em
                style={{ fontStyle: "italic", color: "#B7A6FF" }}
              >
                reconciled
              </em>{" "}
              and auditable — in the browser.
            </h1>

            <p
              className="mt-5 max-w-[46ch]"
              style={{
                color: "rgba(236,237,245,0.74)",
                fontSize: "clamp(1rem, 0.95rem + 0.4vw, 1.18rem)",
                lineHeight: 1.6,
              }}
            >
              Compute IFRS 9 expected credit loss and IFRS 16 lease schedules,
              journals and disclosures — one deterministic audit trail, no spreadsheets.
            </p>

            {/* CTAs */}
            <div className="flex items-center gap-4 mt-8 flex-wrap">
              <Button size="lg" onClick={openDemo}>
                Request a demo
              </Button>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 text-sm font-medium no-underline transition-colors duration-120"
                style={{ color: "#fff" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#B7A6FF"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
              >
                See pricing <ArrowRight className="size-4" />
              </Link>
            </div>

            {/* Stats strip */}
            <div className="flex gap-7 mt-11 flex-wrap">
              {stats.map((s, i) => (
                <div
                  key={s.k}
                  className="flex flex-col gap-0.5"
                  style={
                    i > 0
                      ? { paddingLeft: 28, borderLeft: "1px solid rgba(255,255,255,0.12)" }
                      : {}
                  }
                >
                  <span
                    className="text-[1.6rem] font-medium"
                    style={{ color: "#fff", fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}
                  >
                    {s.v}
                  </span>
                  <span className="text-xs" style={{ color: "rgba(236,237,245,0.55)" }}>
                    {s.k}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — product glimpse */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlimpseCard />
          </motion.div>
        </div>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
