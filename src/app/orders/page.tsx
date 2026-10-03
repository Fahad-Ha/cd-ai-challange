import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Pill } from "@/components/Pill";
import { formatKwd, timeAgo } from "@/lib/format";

export default async function OrdersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, price, created_at, customer_id, tailor_id, requests(title), customer:profiles!orders_customer_id_fkey(display_name), tailor:profiles!orders_tailor_id_fkey(display_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-medium sm:text-4xl">Orders</h1>
      {!orders?.length ? (
        <div className="card text-muted">No orders yet. {profile.role === "customer" ? "Accept a bid to start one." : "Win a bid to start one."}</div>
      ) : (
        <ul className="grid gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-pencil">
                <span>
                  <span className="block font-display text-xl font-medium">{o.requests?.title}</span>
                  <span className="text-sm text-muted">
                    {profile.role === "customer" ? `with ${o.tailor?.display_name}` : `for ${o.customer?.display_name}`} · {formatKwd(Number(o.price))} · {timeAgo(o.created_at)}
                  </span>
                </span>
                <Pill status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
