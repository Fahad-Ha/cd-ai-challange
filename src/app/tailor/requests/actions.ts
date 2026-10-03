"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export interface BidFormState {
  error?: string;
  saved?: boolean;
}

/**
 * Place a new bid or revise the existing one. Both are plain table writes
 * under RLS: the database decides whether this tailor may write this row
 * right now (own bid, request still open). A revise always sends
 * status = 'pending' so a declined bid is explicitly resubmitted.
 */
export async function saveBid(_prev: BidFormState, formData: FormData): Promise<BidFormState> {
  const requestId = String(formData.get("request_id") ?? "");
  const bidId = String(formData.get("bid_id") ?? "");
  const price = Number(formData.get("price"));
  const turnaround = Number(formData.get("turnaround_days"));
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isFinite(price) || price <= 0) return { error: "Enter a price above 0." };
  if (!Number.isInteger(turnaround) || turnaround <= 0) return { error: "Enter a whole number of days." };
  if (note.length > 1000) return { error: "Keep the note under 1000 characters." };

  const supabase = await createClient();
  if (bidId) {
    const { data, error } = await supabase
      .from("bids")
      .update({ price, turnaround_days: turnaround, note, status: "pending" })
      .eq("id", bidId)
      .select("id")
      .maybeSingle();
    if (error) return { error: friendlyError(error, "Could not update the bid.") };
    if (!data) return { error: "This bid can no longer be edited: the request has closed." };
  } else {
    const { error } = await supabase.from("bids").insert({ request_id: requestId, price, turnaround_days: turnaround, note });
    if (error) return { error: friendlyError(error, "Could not place the bid.") };
  }
  revalidatePath(`/tailor/requests/${requestId}`);
  return { saved: true };
}
