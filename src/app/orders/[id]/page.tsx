import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Pill } from "@/components/Pill";
import { StatusStepper, nextStep } from "@/components/StatusStepper";
import { AdvanceButton } from "@/components/AdvanceButton";
import { Chat } from "@/components/Chat";
import { ReviewForm } from "@/components/ReviewForm";
import { RatingStars } from "@/components/RatingStars";
import { days, formatDate, formatKwd } from "@/lib/format";

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

  const [{ data: messages }, { data: review }] = await Promise.all([
    supabase.from("messages").select("id, sender_id, body, created_at").eq("order_id", id).order("created_at", { ascending: true }),
    supabase.from("reviews").select("id, rating, comment, created_at").eq("order_id", id).maybeSingle(),
  ]);

  const isTailor = profile.id === order.tailor_id;
  const step = nextStep(order.status);
  const names = { [order.customer_id]: order.customer?.display_name ?? "Customer", [order.tailor_id]: order.tailor?.display_name ?? "Tailor" };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="grid gap-4">
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-medium sm:text-4xl">{order.requests?.title}</h1>
            <Pill status={order.status} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {isTailor ? (
              <>Customer: <span className="font-semibold text-ink">{order.customer?.display_name}</span></>
            ) : (
              <>Tailor: <Link href={`/tailors/${order.tailor_id}`} className="font-semibold text-ink hover:text-pencil">{order.tailor?.display_name}</Link></>
            )}
            {" · "}accepted {formatDate(order.created_at)}
          </p>
          <p className="mt-3 stat">{formatKwd(Number(order.price))} <small>agreed · {days(order.turnaround_days)}</small></p>
          <div className="mt-5">
            <StatusStepper status={order.status} />
          </div>
          <div className="mt-5">
            {isTailor && step && <AdvanceButton orderId={order.id} status={order.status} label={step.label} to={step.to} />}
            {isTailor && !step && <p className="text-sm text-muted">Completed {order.completed_at ? formatDate(order.completed_at) : ""}. Nothing left to do.</p>}
            {!isTailor && step && <p className="text-sm text-muted">Your tailor updates the status as the work moves along.</p>}
          </div>
        </section>

        <section className="card">
          <h2 className="text-2xl font-medium">Review</h2>
          {review ? (
            <div className="mt-3">
              <RatingStars rating={review.rating} size="text-xl" />
              {review.comment && <p className="mt-2 leading-relaxed">{review.comment}</p>}
              <p className="mt-1 text-xs text-muted">By {order.customer?.display_name}, {formatDate(review.created_at)}</p>
            </div>
          ) : isTailor ? (
            <p className="mt-2 text-sm text-muted">The customer can leave a review once the order is completed.</p>
          ) : order.status === "completed" ? (
            <div className="mt-3"><ReviewForm orderId={order.id} tailorId={order.tailor_id} /></div>
          ) : (
            <p className="mt-2 text-sm text-muted">You can review once the order is completed.</p>
          )}
        </section>
      </div>

      <Chat orderId={order.id} meId={profile.id} names={names} initialMessages={messages ?? []} />
    </div>
  );
}
