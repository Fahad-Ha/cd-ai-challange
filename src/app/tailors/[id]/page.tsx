import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RatingStars } from "@/components/RatingStars";
import { formatDate } from "@/lib/format";

/** Stretch goal: a tailor's public reputation, derived in the database. */
export default async function TailorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();
  const { data: tailor } = await supabase.from("profiles").select("id, display_name, role, created_at").eq("id", id).maybeSingle();
  if (!tailor || tailor.role !== "tailor") notFound();

  const [{ data: stats }, { data: reviews }] = await Promise.all([
    supabase.rpc("tailor_stats", { p_tailor_id: id }).maybeSingle(),
    supabase.from("reviews").select("id, rating, comment, created_at, profiles!reviews_customer_id_fkey(display_name)").eq("tailor_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const avg = stats?.avg_rating != null ? Number(stats.avg_rating) : null;
  const reviewCount = stats?.review_count ?? 0;
  const completed = stats?.completed_orders ?? 0;
  const initials = tailor.display_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <section className="card">
        <div className="flex items-center gap-4">
          <span className="avatar avatar-tailor h-14 w-14 text-xl" aria-hidden="true">{initials}</span>
          <div>
            <h1 className="text-3xl font-medium sm:text-4xl">{tailor.display_name}</h1>
            <p className="text-sm text-tailor">Tailor · on MyTailor since {formatDate(tailor.created_at)}</p>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-3">
          <div className="piece p-3">
            <dt className="text-xs font-semibold text-muted">Average rating</dt>
            <dd className="stat">{avg != null ? avg.toFixed(1) : "–"} <small>/ 5</small></dd>
          </div>
          <div className="piece p-3">
            <dt className="text-xs font-semibold text-muted">Reviews</dt>
            <dd className="stat">{reviewCount} <small>{reviewCount === 1 ? "review" : "reviews"}</small></dd>
          </div>
          <div className="piece p-3">
            <dt className="text-xs font-semibold text-muted">Completed</dt>
            <dd className="stat">{completed} <small>{completed === 1 ? "completed order" : "completed orders"}</small></dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">All three numbers are computed by the database from completed orders and their reviews. Nobody can type them in.</p>
      </section>

      <section className="card">
        <h2 className="text-2xl font-medium">Reviews</h2>
        {!reviews?.length ? (
          <p className="mt-2 text-sm text-muted">No reviews yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                <RatingStars rating={r.rating} />
                {r.comment && <p className="mt-1 leading-relaxed">{r.comment}</p>}
                <p className="mt-1 text-xs text-muted">{r.profiles?.display_name ?? "A customer"} · {formatDate(r.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
