import { Pill } from "@/components/Pill";
import { PhotoGallery } from "@/components/PhotoGallery";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

interface RequestSummary {
  id: string;
  title: string;
  description: string;
  photo_paths: string[];
  status: string;
  created_at: string;
  closed_at: string | null;
}

/** Title, status, photos (signed URLs created with the viewer's own session) and description. */
export async function RequestHeader({ request, postedBy }: { request: RequestSummary; postedBy?: string }) {
  const photos: { url: string; alt: string }[] = [];
  if (request.photo_paths.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("reference-photos").createSignedUrls(request.photo_paths, 600);
    for (const d of data ?? []) {
      if (d.signedUrl) photos.push({ url: d.signedUrl, alt: `Reference photo ${photos.length + 1} of ${request.photo_paths.length}` });
    }
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
      {photos.length > 0 && (
        <div className="mt-4">
          <PhotoGallery photos={photos} />
        </div>
      )}
      <p className="mt-4 max-w-prose whitespace-pre-line leading-relaxed">{request.description}</p>
    </section>
  );
}
