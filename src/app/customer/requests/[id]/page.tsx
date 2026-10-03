import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RequestHeader } from "@/components/RequestHeader";

export default async function CustomerRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("customer");
  const { id } = await params;
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("requests")
    .select("id, title, description, photo_path, status, created_at, closed_at")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound(); // RLS returns nothing for other people's requests

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <RequestHeader request={request} />
      <section className="card">
        <h2 className="text-2xl font-medium">Bids</h2>
        <p className="mt-2 text-sm text-muted">No bids yet. Tailors can see your request now.</p>
      </section>
    </div>
  );
}
