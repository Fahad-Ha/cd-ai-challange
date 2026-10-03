import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RequestHeader } from "@/components/RequestHeader";

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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <RequestHeader request={request} postedBy={request.profiles?.display_name} />
      <section className="card-raised">
        <h2 className="text-2xl font-medium">Your bid</h2>
        <p className="mt-2 text-sm text-muted">Bidding arrives in the next step.</p>
      </section>
    </div>
  );
}
