import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { describePhoto } from "@/lib/ai";

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

  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "That photo is not yours." }, { status: 403 });
  }
  if (!allow(user.id)) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });

  // Download with the user's own client so storage RLS decides, not this route.
  const { data: blob, error } = await supabase.storage.from("reference-photos").download(path);
  if (error || !blob) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  try {
    const description = await describePhoto(Buffer.from(await blob.arrayBuffer()), blob.type || "image/jpeg");
    return NextResponse.json({ description });
  } catch (e) {
    console.error("describe-photo failed", e);
    return NextResponse.json({ error: "The description service is unavailable right now. You can still write your own." }, { status: 502 });
  }
}
