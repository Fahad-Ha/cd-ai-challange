import { createClient } from "@/lib/supabase/server";
import { formatKwd } from "@/lib/format";

/** The only cross-tailor view of a request: a server-computed aggregate. */
export async function BidStats({ requestId }: { requestId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("request_bid_stats", { p_request_id: requestId }).maybeSingle();
  const count = data?.bid_count ?? 0;
  const unlocked = data?.avg_price != null;

  return (
    <section className="piece bg-surface/70 p-5">
      <h2 className="text-2xl font-medium">All bids on this request</h2>
      <p className="mt-1 text-sm text-muted">A summary only. No tailor can see another tailor&apos;s bid.</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr_1fr] gap-4">
        <div>
          <dt className="text-xs font-semibold text-muted">Bids</dt>
          <dd className="stat">{count}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">Average price</dt>
          <dd className="stat whitespace-nowrap">{unlocked ? formatKwd(Math.round(Number(data!.avg_price))) : "–"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">Average turnaround</dt>
          <dd className="stat">{unlocked ? <>{Number(data!.avg_turnaround)} <small>days</small></> : "–"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        {unlocked
          ? `Averages of all ${count} bids.`
          : `${count} ${count === 1 ? "bid" : "bids"} so far. Averages appear once there are 3.`}
      </p>
    </section>
  );
}
