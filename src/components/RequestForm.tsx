"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { createRequest, type FormState } from "@/app/customer/requests/actions";

type PhotoStatus = { kind: "idle" } | { kind: "uploading" } | { kind: "done"; path: string } | { kind: "error"; message: string };

export function RequestForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createRequest, {});
  const [photo, setPhoto] = useState<PhotoStatus>({ kind: "idle" });
  const [description, setDescription] = useState("");
  const [describing, setDescribing] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto({ kind: "uploading" });
    setAiMessage(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setPhoto({ kind: "error", message: "You are signed out." });
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("reference-photos").upload(path, file, { contentType: file.type });
    setPhoto(error ? { kind: "error", message: error.message } : { kind: "done", path });
  }

  async function describe() {
    if (photo.kind !== "done") return;
    setDescribing(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/describe-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: photo.path }),
      });
      const json = (await res.json()) as { description?: string; error?: string };
      if (!res.ok || !json.description) setAiMessage(json.error ?? "Could not describe the photo.");
      else {
        setDescription(json.description);
        setAiMessage("Suggested from your photo. Edit it however you like.");
      }
    } catch {
      setAiMessage("Could not reach the description service.");
    } finally {
      setDescribing(false);
    }
  }

  return (
    <form action={action} className="card-raised grid gap-5">
      <label className="field">
        <span>Title</span>
        <input id="title" name="title" className="input" required maxLength={120} placeholder="Navy wool two-piece suit" />
      </label>

      <div className="field">
        <label htmlFor="photo"><span>Reference photo (optional)</span></label>
        <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} className="text-sm" />
        <input type="hidden" name="photo_path" value={photo.kind === "done" ? photo.path : ""} />
        <p className="text-xs text-muted" aria-live="polite">
          {photo.kind === "idle" && "JPEG, PNG or WebP, up to 5 MB. Only you and tailors can see it."}
          {photo.kind === "uploading" && "Uploading…"}
          {photo.kind === "done" && "Photo uploaded."}
          {photo.kind === "error" && `Upload failed: ${photo.message}`}
        </p>
      </div>

      <div className="field">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="description"><span>Description</span></label>
          <button type="button" className="btn btn-secondary text-sm" onClick={describe} disabled={photo.kind !== "done" || describing}>
            {describing ? "Describing…" : "Describe with AI"}
          </button>
        </div>
        <textarea
          id="description"
          name="description"
          className="input min-h-36"
          required
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Garment, fabric, colour, fit, details, and when you need it."
        />
        {aiMessage && <p className="text-xs text-muted" aria-live="polite">{aiMessage}</p>}
      </div>

      {state.error && <p role="alert" className="alert alert-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending || photo.kind === "uploading"}>
        {pending ? "Posting…" : "Post request"}
      </button>
    </form>
  );
}
