import { Pill } from "@/components/Pill";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export interface RequestSummary {
  id: string;
  title: string;
  description: string;
  photo_path: string | null;
  status: string;
  created_at: string;
  closed_at: string | null;
}

/** Title, status, photo (via a signed URL created with the viewer's own session) and description. */
export async function RequestHeader({ request, postedBy }: { request: RequestSummary; postedBy?: string }) {
  let photoUrl: string | null = null;
  if (request.photo_path) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("reference-photos").createSignedUrl(request.photo_path, 600);
    photoUrl = data?.signedUrl ?? null;
  }
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-medium sm:text-4xl">{request.title}</h1>
        <Pill status={request.status} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {postedBy ? `Posted by ${postedBy} ` : "Posted "}
        {timeAgo(request.created_at)}
        {request.closed_at ? ` · closed ${timeAgo(request.closed_at)}` : ""}
      </p>
      {photoUrl && (
        <div className="piece mt-4 overflow-hidden bg-pencil-soft/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="Reference photo" className="mx-auto max-h-96 w-auto max-w-full object-contain" />
        </div>
      )}
      <p className="mt-4 max-w-prose whitespace-pre-line leading-relaxed">{request.description}</p>
    </section>
  );
}
