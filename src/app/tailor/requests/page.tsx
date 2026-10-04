import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/format";
import { Pill } from "@/components/Pill";

export default async function TailorRequestsPage() {
  await requireRole("tailor");
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("requests")
    .select("id, title, description, created_at, profiles(display_name)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  // RLS returns only this tailor's bids, so this is "where have I already bid, and how is it going".
  const { data: myBids } = await supabase.from("bids").select("request_id, status");
  const mine = new Map((myBids ?? []).map((b) => [b.request_id, b.status]));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-medium sm:text-4xl">Open requests</h1>
        <p className="mt-2 text-muted">Bid on what you can make. Other tailors never see your price.</p>
      </div>
      {!requests?.length ? (
        <div className="card text-muted">No open requests right now. Check back soon.</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/tailor/requests/${r.id}`} className="card block h-full transition-colors hover:border-pencil">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-display text-xl font-medium">{r.title}</span>
                  {mine.has(r.id) ? <Pill status={mine.get(r.id)!}>Your bid: {mine.get(r.id) === "pending" ? "pending" : mine.get(r.id)}</Pill> : <span className="pill pill-closed">Not bid yet</span>}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {r.profiles?.display_name ?? "A customer"} · {timeAgo(r.created_at)}
                </span>
                <span className="mt-3 line-clamp-3 block text-sm leading-relaxed">{r.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
