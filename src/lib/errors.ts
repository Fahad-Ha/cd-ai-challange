/** Turn a PostgREST/Supabase error into something a person can act on. */
export function friendlyError(error: { code?: string; message?: string } | null | undefined, fallback = "Something went wrong."): string {
  if (!error) return fallback;
  switch (error.code) {
    case "42501":
      // Authorization failures. RPCs raise with a specific message; RLS policy violations do not.
      return error.message && !/row-level security|permission denied/i.test(error.message) ? error.message : "You're not allowed to do that.";
    case "23505":
      return "That already exists.";
    case "P0001":
      return error.message ?? fallback;
    default:
      return error.message || fallback;
  }
}
