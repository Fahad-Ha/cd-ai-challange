import { requireRole } from "@/lib/auth";
import { RequestForm } from "@/components/RequestForm";

export default async function NewRequestPage() {
  await requireRole("customer");
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <h1 className="text-3xl font-medium sm:text-4xl">New request</h1>
        <p className="mt-2 text-muted">Tailors bid without seeing each other&apos;s offers. You pick one; the rest close.</p>
      </div>
      <RequestForm />
    </div>
  );
}
