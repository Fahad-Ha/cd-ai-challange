import { requireRole } from "@/lib/auth";

export default async function TailorRequestsPage() {
  await requireRole("tailor");
  return (
    <div>
      <h1 className="text-3xl font-medium">Open requests</h1>
      <p className="mt-2 text-muted">No open requests right now.</p>
    </div>
  );
}
