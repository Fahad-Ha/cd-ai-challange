import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RequestHeader } from "@/components/RequestHeader";
import { BidForm } from "@/components/BidForm";
import { BidStats } from "@/components/BidStats";
import { Pill } from "@/components/Pill";
import { timeAgo } from "@/lib/format";

export default async function TailorRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("tailor");
  const { id } = await params;
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("requests")
    .select("id, title, description, photo_path, status, created_at, closed_at, profiles(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();

  // RLS guarantees this is my bid or nothing.
  const { data: bid } = await supabase
    .from("bids")
    .select("id, price, turnaround_days, note, status, updated_at, bid_revisions(count)")
    .eq("request_id", id)
    .maybeSingle();
  const revisions = (bid?.bid_revisions as unknown as Array<{ count: number }> | undefined)?.[0]?.count ?? 0;
  const order = bid?.status === "accepted"
    ? (await supabase.from("orders").select("id").eq("bid_id", bid.id).maybeSingle()).data
    : null;
  const open = request.status === "open";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <RequestHeader request={request} postedBy={request.profiles?.display_name} />
      <div className="grid gap-4">
        <section className="card-raised">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-medium">Your bid</h2>
            {bid && <Pill status={bid.status} />}
          </div>
          {bid && (
            <p className="mt-1 text-sm text-muted">
              Revision {revisions} · last edited {timeAgo(bid.updated_at)}
            </p>
          )}
          {bid?.status === "declined" && open && (
            <p className="alert alert-error mt-3">The customer declined this bid. Revise it to resubmit.</p>
          )}
          <div className="mt-4">
            {open ? (
              <BidForm requestId={request.id} bid={bid ? { id: bid.id, price: Number(bid.price), turnaround_days: bid.turnaround_days, note: bid.note } : null} />
            ) : bid?.status === "accepted" ? (
              <div className="grid gap-3">
                <p className="alert alert-ok">Your bid was accepted. The request has closed.</p>
                {order && <Link href={`/orders/${order.id}`} className="btn btn-primary">Open the order</Link>}
              </div>
            ) : (
              <p className="text-sm text-muted">
                This request has closed{bid ? " and your bid is frozen as it stood." : "."}
              </p>
            )}
          </div>
        </section>
        {open && <BidStats requestId={request.id} />}
      </div>
    </div>
  );
}
