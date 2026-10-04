import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

export interface NavCounts {
  /** Customer: bids waiting for a decision. Tailor: open requests to bid on. */
  requests: number;
  /** Orders that are not completed yet (both roles). */
  orders: number;
}

/** Badge numbers for the nav. Every query runs as the user, so RLS scopes them for free. */
export async function getNavCounts(profile: Profile): Promise<NavCounts> {
  const supabase = await createClient();
  const [requests, orders] = await Promise.all([
    profile.role === "customer"
      ? supabase.from("bids").select("id, requests!inner(status)", { count: "exact", head: true }).eq("status", "pending").eq("requests.status", "open")
      : supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "completed"),
  ]);
  return { requests: requests.count ?? 0, orders: orders.count ?? 0 };
}
