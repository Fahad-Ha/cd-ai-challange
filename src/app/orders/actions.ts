"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export interface ActionState {
  error?: string;
}

/** Linear pipeline step. The database checks the caller is the tailor and the step is the next one. */
export async function advanceOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("order_id") ?? "");
  const expected = String(formData.get("expected_status") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_order", { p_order_id: orderId, p_expected_status: expected });
  if (error) return { error: friendlyError(error, "Could not update the order.") };
  revalidatePath(`/orders/${orderId}`);
  return {};
}

/** A plain insert: the reviews INSERT policy is the whole rule (customer, completed, once). */
export async function postReview(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("order_id") ?? "");
  const tailorId = String(formData.get("tailor_id") ?? "");
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Pick a rating from 1 to 5 stars." };
  if (comment.length > 2000) return { error: "Keep the comment under 2000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("reviews").insert({ order_id: orderId, tailor_id: tailorId, rating, comment });
  if (error) return { error: friendlyError(error, "Could not post the review.") };
  revalidatePath(`/orders/${orderId}`);
  return {};
}
