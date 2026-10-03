"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export interface FormState {
  error?: string;
}

export async function createRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const photo = String(formData.get("photo_path") ?? "").trim();

  if (title.length < 1 || title.length > 120) return { error: "Give the request a title (up to 120 characters)." };
  if (description.length < 1 || description.length > 4000) return { error: "Describe what you need (up to 4000 characters)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .insert({ title, description, photo_path: photo || null })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not post the request.") };
  redirect(`/customer/requests/${data.id}`);
}
