/**
 * Test helpers: talk to Supabase the way a real browser would (publishable key +
 * a signed-in user's JWT) so every assertion runs under RLS. The secret key is
 * used only to create/delete throwaway users through the Auth admin API.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

if (!url || !publishableKey || !secretKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY");
}

export type Role = "customer" | "tailor";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  client: SupabaseClient; // signed in as this user
}

export const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export function anonClient(): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const created: string[] = [];

export async function createUser(role: Role | string, displayName = `${role} user`): Promise<TestUser> {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = "password123";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, display_name: displayName },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  created.push(data.user.id);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);
  return { id: data.user.id, email, password, role: role as Role, client };
}

/** Delete every user this test file created (cascades through profiles → requests → bids …). */
export async function cleanupUsers() {
  for (const id of created.splice(0)) {
    await admin.auth.admin.deleteUser(id);
  }
}

/** Convenience: assert a PostgREST error carries the expected SQLSTATE. */
export function expectCode(error: { code?: string; message?: string } | null, code: string, context: string) {
  if (!error) throw new Error(`${context}: expected error ${code} but call succeeded`);
  if (error.code !== code) throw new Error(`${context}: expected ${code}, got ${error.code} (${error.message})`);
}
