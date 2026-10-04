import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describePhotos, type ImageInput } from "@/lib/ai";

const MAX_PHOTOS = 6;

// Tiny in-memory limiter: 10 descriptions per user per minute. Per server
// instance, which is fine for a demo; a shared store would replace it.
const recent = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 10) return false;
  hits.push(now);
  recent.set(userId, hits);
  return true;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to use photo descriptions." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { paths?: unknown; path?: unknown } | null;
  const raw = Array.isArray(body?.paths) ? body.paths : typeof body?.path === "string" ? [body.path] : [];
  const paths = raw.filter((p): p is string => typeof p === "string").slice(0, MAX_PHOTOS);
  if (paths.length === 0) return NextResponse.json({ error: "Upload at least one photo first." }, { status: 400 });
  if (paths.some((p) => !p.startsWith(`${user.id}/`) || p.includes(".."))) {
    return NextResponse.json({ error: "Those photos are not yours." }, { status: 403 });
  }
  if (!allow(user.id)) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });

  // Shared quota (per user per day + global per day) lives in the database, so
  // every server instance counts the same calls. Raises before any money is spent.
  const credit = await supabase.rpc("consume_ai_credit").maybeSingle();
  if (credit.error) {
    const quota = credit.error.code === "P0001";
    return NextResponse.json({ error: quota ? credit.error.message : "Could not check your AI quota." }, { status: quota ? 429 : 500 });
  }

  // Download with the user's own client so storage RLS decides, not this route.
  const images: ImageInput[] = [];
  for (const path of paths) {
    const { data: blob, error } = await supabase.storage.from("reference-photos").download(path);
    if (error || !blob) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    images.push({ bytes: Buffer.from(await blob.arrayBuffer()), mime: blob.type || "image/jpeg" });
  }

  try {
    const description = await describePhotos(images);
    return NextResponse.json({ description, remaining_today: credit.data?.remaining_today ?? null });
  } catch (e) {
    console.error("describe-photo failed", e);
    return NextResponse.json({ error: "The description service is unavailable right now. You can still write your own." }, { status: 502 });
  }
}
