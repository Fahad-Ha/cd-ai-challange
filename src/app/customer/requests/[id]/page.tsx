import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RequestHeader } from "@/components/RequestHeader";
import { BidActions } from "@/components/BidActions";
import { Avatar } from "@/components/Avatar";
import { Pill } from "@/components/Pill";
import { days, formatKwd, timeAgo } from "@/lib/format";

export default async function CustomerRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("customer");
  const { id } = await params;
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("requests")
    .select("id, title, description, photo_paths, status, created_at, closed_at")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound(); // RLS returns nothing for other people's requests

  const { data: bids } = await supabase
    .from("bids")
    .select("id, tailor_id, price, turnaround_days, note, status, updated_at, profiles(display_name), bid_revisions(count)")
    .eq("request_id", id)
    .order("created_at", { ascending: true });
  const order = request.status === "closed"
    ? (await supabase.from("orders").select("id").eq("request_id", id).maybeSingle()).data
    : null;
  const open = request.status === "open";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <RequestHeader request={request} />
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-medium">Bids</h2>
          {order && <Link href={`/orders/${order.id}`} className="btn btn-primary text-sm">Open the order</Link>}
        </div>
        {!bids?.length ? (
          <p className="mt-2 text-sm text-muted">No bids yet. Tailors can see your request now.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {bids.map((b) => {
              const revisions = (b.bid_revisions as unknown as Array<{ count: number }>)[0]?.count ?? 0;
              return (
                <li key={b.id} data-bid={b.id} className={`rounded-field border p-4 ${b.status === "accepted" ? "border-tailor bg-tailor-soft/40" : "border-line"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link
                      href={`/tailors/${b.tailor_id}`}
                      title="View this tailor's profile and reviews"
                      className="group flex items-center gap-3 rounded-field pr-2 transition-colors hover:text-pencil"
                    >
                      <Avatar name={b.profiles?.display_name ?? "Tailor"} role="tailor" size="md" />
                      <span>
                        <span className="block font-semibold group-hover:underline">{b.profiles?.display_name ?? "Tailor"}</span>
                        <span className="block text-xs text-muted">
                          {revisions} revision{revisions === 1 ? "" : "s"} · {timeAgo(b.updated_at)} · <span className="text-pencil">View profile</span>
                        </span>
                      </span>
                    </Link>
                    <Pill status={b.status} />
                  </div>
                  <p className="mt-3 stat">{formatKwd(Number(b.price))}<small>in {days(b.turnaround_days)}</small></p>
                  {b.note && <p className="mt-2 text-sm leading-relaxed">{b.note}</p>}
                  {open && b.status === "pending" && (
                    <div className="mt-3">
                      <BidActions requestId={request.id} bid={{ id: b.id, price: Number(b.price), turnaround_days: b.turnaround_days }} />
                    </div>
                  )}
                  {open && b.status === "declined" && <p className="mt-3 text-xs text-muted">Declined. The tailor can still revise and resubmit.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
