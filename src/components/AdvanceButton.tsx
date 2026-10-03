"use client";

import { useActionState } from "react";
import { advanceOrder, type ActionState } from "@/app/orders/actions";

export function AdvanceButton({ orderId, status, label, to }: { orderId: string; status: string; label: string; to: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(advanceOrder, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="expected_status" value={status} />
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Updating…" : label}</button>
      {state.error && <p role="alert" className="alert alert-error text-sm">{state.error}</p>}
      <p className="text-xs text-muted">Next: {to.replace("_", " ")}. Steps cannot be skipped or undone.</p>
    </form>
  );
}
