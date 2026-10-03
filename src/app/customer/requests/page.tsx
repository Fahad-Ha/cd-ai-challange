import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Pill } from "@/components/Pill";
import { timeAgo } from "@/lib/format";

export default async function CustomerRequestsPage() {
  await requireRole("customer");
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("requests")
    .select("id, title, status, created_at, bids(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-medium sm:text-4xl">My requests</h1>
        <Link href="/customer/requests/new" className="btn btn-primary">New request</Link>
      </div>
      {!requests?.length ? (
        <div className="card text-muted">
          Nothing yet. <Link href="/customer/requests/new" className="font-semibold text-pencil">Post your first request</Link> and tailors will start bidding.
        </div>
      ) : (
        <ul className="grid gap-3">
          {requests.map((r) => {
            const bidCount = (r.bids as unknown as Array<{ count: number }>)[0]?.count ?? 0;
            return (
              <li key={r.id}>
                <Link href={`/customer/requests/${r.id}`} className="card flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-pencil">
                  <span>
                    <span className="block font-display text-xl font-medium">{r.title}</span>
                    <span className="text-sm text-muted">Posted {timeAgo(r.created_at)} · {bidCount} bid{bidCount === 1 ? "" : "s"}</span>
                  </span>
                  <Pill status={r.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
