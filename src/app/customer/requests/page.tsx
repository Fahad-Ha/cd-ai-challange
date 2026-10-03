import { requireRole } from "@/lib/auth";

export default async function CustomerRequestsPage() {
  await requireRole("customer");
  return (
    <div>
      <h1 className="text-3xl font-medium">My requests</h1>
      <p className="mt-2 text-muted">Nothing yet. Post your first request to start receiving bids.</p>
    </div>
  );
}
