"use client";

import { useActionState } from "react";
import { saveBid, type BidFormState } from "@/app/tailor/requests/actions";

interface Props {
  requestId: string;
  bid: { id: string; price: number; turnaround_days: number; note: string } | null;
}

export function BidForm({ requestId, bid }: Props) {
  const [state, action, pending] = useActionState<BidFormState, FormData>(saveBid, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="request_id" value={requestId} />
      {bid && <input type="hidden" name="bid_id" value={bid.id} />}
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span>Price <span className="unit">KWD</span></span>
          <input id="price" name="price" type="number" min="1" step="0.01" required className="input input-number" defaultValue={bid?.price ?? ""} />
        </label>
        <label className="field">
          <span>Turnaround <span className="unit">days</span></span>
          <input id="turnaround_days" name="turnaround_days" type="number" min="1" step="1" required className="input input-number" defaultValue={bid?.turnaround_days ?? ""} />
        </label>
      </div>
      <label className="field">
        <span>Note</span>
        <textarea id="note" name="note" className="input min-h-24" maxLength={1000} defaultValue={bid?.note ?? ""} placeholder="Cloth, construction, fittings included." />
      </label>
      {state.error && <p role="alert" className="alert alert-error">{state.error}</p>}
      {state.saved && !state.error && <p className="alert alert-ok" aria-live="polite">Bid saved.</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : bid ? "Update bid" : "Place bid"}
      </button>
      <p className="text-xs text-muted">You can revise until the request closes. The customer sees every revision.</p>
    </form>
  );
}
