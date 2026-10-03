import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getProfile } from "@/lib/auth";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz"], display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "MyTailor",
  description: "Bespoke tailoring, bid by bid.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <html lang="en" className={`${fraunces.variable} ${figtree.variable}`}>
      <body className="min-h-dvh">
        <AppShell profile={profile}>{children}</AppShell>
      </body>
    </html>
  );
}
