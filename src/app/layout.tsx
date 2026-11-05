import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { fontVariables } from "@/lib/fonts";
import { ServiceWorkerCleanup } from "@/components/shared/ServiceWorkerCleanup";

export const metadata: Metadata = {
  title: "Ledgerline — IFRS 9 credit loss & IFRS 16 lease accounting",
  description:
    "Deterministic, auditable IFRS 9 expected credit loss and IFRS 16 lease accounting. Upload, compute, approve and reconcile in one workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={fontVariables}>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <ServiceWorkerCleanup />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
