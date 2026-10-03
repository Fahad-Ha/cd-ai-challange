"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const display_name = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  // Validate the role here too, so a typo can never silently create an immutable customer.
  if (role !== "customer" && role !== "tailor") return { error: "Choose a role: customer or tailor." };
  if (display_name.length < 1 || display_name.length > 80) return { error: "Enter a name (up to 80 characters)." };
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { role, display_name } } });
  if (error) return { error: error.message };
  redirect("/");
}

export async function logIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
