"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { createRequest, type FormState } from "@/app/customer/requests/actions";

const MAX_PHOTOS = 6;

interface Photo {
  path: string;
  preview: string; // local object URL for the thumbnail
}
type AiStatus = { kind: "idle" } | { kind: "working" } | { kind: "done"; remaining: number | null } | { kind: "error"; message: string };

export function RequestForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createRequest, {});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [ai, setAi] = useState<AiStatus>({ kind: "idle" });
  const [flash, setFlash] = useState(false);

  async function onPhotosChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return setUploadError(`You can attach up to ${MAX_PHOTOS} photos.`);
    const batch = files.slice(0, room);
    if (batch.length < files.length) setUploadError(`Only the first ${room} added: up to ${MAX_PHOTOS} photos per request.`);
    else setUploadError(null);

    setUploading((n) => n + batch.length);
    setAi({ kind: "idle" });
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploading(0);
      return setUploadError("You are signed out.");
    }
    for (const file of batch) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("reference-photos").upload(path, file, { contentType: file.type });
      if (error) setUploadError(`${file.name}: ${error.message}`);
      else setPhotos((prev) => [...prev, { path, preview: URL.createObjectURL(file) }]);
      setUploading((n) => n - 1);
    }
  }

  function removePhoto(path: string) {
    setPhotos((prev) => prev.filter((p) => p.path !== path));
  }

  async function describe() {
    if (photos.length === 0) return;
    setAi({ kind: "working" });
    try {
      const res = await fetch("/api/describe-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: photos.map((p) => p.path) }),
      });
      const json = (await res.json()) as { description?: string; error?: string; remaining_today?: number | null };
      if (!res.ok || !json.description) {
        setAi({ kind: "error", message: json.error ?? "Could not describe the photos." });
      } else {
        setDescription(json.description);
        setAi({ kind: "done", remaining: json.remaining_today ?? null });
        setFlash(true);
        setTimeout(() => setFlash(false), 1800);
      }
    } catch {
      setAi({ kind: "error", message: "Could not reach the description service." });
    }
  }

  const working = ai.kind === "working";
  const busy = uploading > 0;
  const hasPhotos = photos.length > 0;

  return (
    <form action={action} className="card-raised grid gap-5">
      <label className="field">
        <span>Title</span>
        <input id="title" name="title" className="input" required maxLength={120} placeholder="Navy wool two-piece suit" />
      </label>

      <div className="field">
        <label htmlFor="photo"><span>Reference photos (optional, up to {MAX_PHOTOS})</span></label>
        <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onPhotosChange} className="text-sm" disabled={working || photos.length >= MAX_PHOTOS} />
        <input type="hidden" name="photo_paths" value={JSON.stringify(photos.map((p) => p.path))} />
        {hasPhotos && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Attached photos">
            {photos.map((p, i) => (
              <li key={p.path} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt={`Attached photo ${i + 1}`} className="h-20 w-20 rounded-field border border-line object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.path)}
                  disabled={working}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-xs font-semibold text-muted shadow-sm hover:text-declined"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted" aria-live="polite">
          {busy && `Uploading ${uploading} photo${uploading === 1 ? "" : "s"}…`}
          {!busy && !hasPhotos && !uploadError && "JPEG, PNG or WebP, up to 5 MB each. Only you and tailors can see them."}
          {!busy && hasPhotos && !uploadError && `${photos.length} photo${photos.length === 1 ? "" : "s"} attached. The AI can draft the description from ${photos.length === 1 ? "it" : "them"}.`}
          {uploadError && <span className="text-declined">{uploadError}</span>}
        </p>
      </div>

      <div className="field">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="description"><span>Description</span></label>
          <button
            type="button"
            className={`btn text-sm ${hasPhotos && !working && !busy ? "btn-primary" : "btn-secondary"}`}
            onClick={describe}
            disabled={!hasPhotos || working || busy}
            aria-busy={working}
          >
            {working ? (
              <>
                <span className="spinner" aria-hidden="true" /> Describing…
              </>
            ) : (
              "Describe with AI"
            )}
          </button>
        </div>

        <div className="relative">
          <textarea
            id="description"
            name="description"
            className={`input min-h-36 ${flash ? "flash-ring" : ""}`}
            required
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Garment, fabric, colour, fit, details, and when you need it."
            disabled={working}
            aria-describedby="ai-status"
          />
          {working && (
            <div className="absolute inset-0 grid place-items-center rounded-field bg-surface/85 backdrop-blur-[2px]" role="status" aria-live="polite">
              <div className="w-72 max-w-[90%] text-center">
                <span className="spinner mx-auto block h-8 w-8 border-[3px]" aria-hidden="true" />
                <p className="mt-3 font-display text-lg font-medium">Looking at your {photos.length === 1 ? "photo" : "photos"}…</p>
                <p className="mt-1 text-sm text-muted">Drafting a description you can edit. Usually a few seconds.</p>
                <div className="progress-indeterminate mt-4" aria-hidden="true" />
              </div>
            </div>
          )}
        </div>

        <p id="ai-status" className="text-xs" aria-live="polite">
          {ai.kind === "done" && (
            <span className="rounded-full bg-pencil-soft px-2 py-0.5 font-medium text-pencil">
              Drafted from your {photos.length === 1 ? "photo" : "photos"}. Edit it however you like.{ai.remaining != null ? ` ${ai.remaining} AI drafts left today.` : ""}
            </span>
          )}
          {ai.kind === "error" && <span className="text-declined">{ai.message}</span>}
          {ai.kind === "idle" && !hasPhotos && <span className="text-muted">Attach photos to enable the AI draft, or write the description yourself.</span>}
        </p>
      </div>

      {state.error && <p role="alert" className="alert alert-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending || busy || working}>
        {pending ? "Posting…" : "Post request"}
      </button>
    </form>
  );
}
