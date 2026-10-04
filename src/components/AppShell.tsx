import Link from "next/link";
import type { Profile } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/Avatar";
import type { NavCounts } from "@/lib/counts";

const LINKS = {
  customer: [
    { href: "/customer/requests", label: "My requests", count: "requests", title: "bids waiting for your decision" },
    { href: "/orders", label: "Orders", count: "orders", title: "orders in progress" },
  ],
  tailor: [
    { href: "/tailor/requests", label: "Open requests", count: "requests", title: "open requests" },
    { href: "/orders", label: "Orders", count: "orders", title: "orders in progress" },
  ],
} as const;

function Badge({ n, title }: { n: number; title: string }) {
  if (n <= 0) return null;
  return (
    <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-pencil px-1.5 text-[11px] font-semibold leading-5 text-white" title={`${n} ${title}`}>
      {n}
    </span>
  );
}

export function AppShell({ profile, counts, children }: { profile: Profile | null; counts: NavCounts | null; children: React.ReactNode }) {
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
                    <Badge n={counts?.[l.count] ?? 0} title={l.title} />
                  </Link>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="role-chip">
                  <Avatar name={profile.display_name} role={profile.role} />
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
                <Badge n={counts?.[l.count] ?? 0} title={l.title} />
              </Link>
            ))}
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
