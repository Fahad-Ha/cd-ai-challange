import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Pill } from "@/components/Pill";
import { days, formatKwd } from "@/lib/format";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, price, turnaround_days, created_at, completed_at, customer_id, tailor_id, requests(title, description), customer:profiles!orders_customer_id_fkey(display_name), tailor:profiles!orders_tailor_id_fkey(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound(); // not a participant → the row does not exist for you

  return (
    <div className="grid gap-6">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-medium sm:text-4xl">{order.requests?.title}</h1>
          <Pill status={order.status} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {profile.role === "customer" ? `Tailor: ${order.tailor?.display_name}` : `Customer: ${order.customer?.display_name}`}
        </p>
        <p className="mt-3 stat">{formatKwd(Number(order.price))}<small>agreed · {days(order.turnaround_days)}</small></p>
      </section>
    </div>
  );
}
