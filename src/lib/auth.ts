import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "customer" | "tailor";
export interface Profile {
  id: string;
  role: Role;
  display_name: string;
}

/**
 * The signed-in user's profile, read from the profiles table — never from
 * user_metadata, which any user can rewrite. Null when signed out.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, role, display_name").eq("id", user.id).single();
  return data ? { id: data.id, role: data.role as Role, display_name: data.display_name } : null;
}

export function homeFor(role: Role) {
  return role === "customer" ? "/customer/requests" : "/tailor/requests";
}

/** Page guard: sends signed-out users to login and the other role to their own home. */
export async function requireRole(role: Role): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== role) redirect(homeFor(profile.role));
  return profile;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}
