"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export interface FormState {
  error?: string;
}

export async function createRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  let photo_paths: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(formData.get("photo_paths") ?? "[]"));
    photo_paths = Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string" && p.length <= 512) : [];
  } catch {
    photo_paths = [];
  }

  if (title.length < 1 || title.length > 120) return { error: "Give the request a title (up to 120 characters)." };
  if (description.length < 1 || description.length > 4000) return { error: "Describe what you need (up to 4000 characters)." };
  if (photo_paths.length > 6) return { error: "Attach up to 6 photos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .insert({ title, description, photo_paths })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not post the request.") };
  redirect(`/customer/requests/${data.id}`);
}

export interface BidActionState {
  error?: string;
}

/** Accept: one locked, atomic database function. The expected price guards against a last-second revision. */
export async function acceptBid(_prev: BidActionState, formData: FormData): Promise<BidActionState> {
  const bidId = String(formData.get("bid_id") ?? "");
  const price = Number(formData.get("expected_price"));
  const turnaround = Number(formData.get("expected_turnaround"));
  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("accept_bid", {
    p_bid_id: bidId,
    p_expected_price: price,
    p_expected_turnaround: turnaround,
  });
  if (error || !orderId) return { error: friendlyError(error, "Could not accept the bid.") };
  redirect(`/orders/${orderId}`);
}

export async function declineBid(_prev: BidActionState, formData: FormData): Promise<BidActionState> {
  const bidId = String(formData.get("bid_id") ?? "");
  const requestId = String(formData.get("request_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_bid", { p_bid_id: bidId });
  if (error) return { error: friendlyError(error, "Could not decline the bid.") };
  revalidatePath(`/customer/requests/${requestId}`);
  return {};
}
