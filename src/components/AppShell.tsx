import Link from "next/link";
import type { Profile } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";

const LINKS = {
  customer: [
    { href: "/customer/requests", label: "My requests" },
    { href: "/orders", label: "Orders" },
  ],
  tailor: [
    { href: "/tailor/requests", label: "Open requests" },
    { href: "/orders", label: "Orders" },
  ],
} as const;

export function AppShell({ profile, children }: { profile: Profile | null; children: React.ReactNode }) {
  const initials = profile?.display_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <>
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="font-display text-2xl font-semibold tracking-tight" style={{ fontVariationSettings: '"opsz" 144' }}>
            MyTailor
          </Link>
          {profile ? (
            <>
              <div className="hidden gap-1 sm:flex">
                {LINKS[profile.role].map((l) => (
                  <Link key={l.href} href={l.href} className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:bg-closed-soft hover:text-ink">
                    {l.label}
                  </Link>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="role-chip">
                  <span className={`avatar avatar-${profile.role}`} aria-hidden="true">{initials}</span>
                  <span className="hidden text-sm leading-tight sm:block">
                    <b className="block font-semibold">{profile.display_name}</b>
                    <span className={profile.role === "customer" ? "text-customer" : "text-tailor"}>
                      {profile.role === "customer" ? "Customer" : "Tailor"}
                    </span>
                  </span>
                </span>
                <form action={signOut}>
                  <button type="submit" className="btn btn-ghost text-sm">Sign out</button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Link href="/login" className="btn btn-ghost text-sm">Log in</Link>
              <Link href="/signup" className="btn btn-primary text-sm">Create account</Link>
            </div>
          )}
        </nav>
        {profile && (
          <div className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
            {LINKS[profile.role].map((l) => (
              <Link key={l.href} href={l.href} className="rounded-full px-3 py-1 text-sm font-medium text-muted">
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
