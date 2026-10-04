"use client";

import { useActionState, useState } from "react";
import { saveBid, type BidFormState } from "@/app/tailor/requests/actions";
import { days, formatKwd } from "@/lib/format";

interface Props {
  requestId: string;
  bid: { id: string; price: number; turnaround_days: number; note: string; status: string } | null;
}

/**
 * New bid: the form is open straight away.
 * Existing bid: a read-only summary with an explicit "Edit bid" step, so a
 * stray keystroke can never change a live offer. Saving returns to the summary.
 */
export function BidForm({ requestId, bid }: Props) {
  const [state, action, pending] = useActionState<BidFormState, FormData>(saveBid, {});
  const [editing, setEditing] = useState(bid === null);

  // Leave edit mode when a save lands (state changes identity per action result).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.saved) setEditing(false);
  }

  if (bid && !editing) {
    return (
      <div className="grid gap-4">
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-field bg-paper/70 px-3 py-2">
            <dt className="text-xs font-semibold text-muted">Price</dt>
            <dd className="stat">{formatKwd(bid.price)}</dd>
          </div>
          <div className="rounded-field bg-paper/70 px-3 py-2">
            <dt className="text-xs font-semibold text-muted">Turnaround</dt>
            <dd className="stat">{days(bid.turnaround_days)}</dd>
          </div>
        </dl>
        {bid.note && <p className="text-sm leading-relaxed text-ink">{bid.note}</p>}
        {state.saved && <p className="alert alert-ok" aria-live="polite">Bid saved.</p>}
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
          {bid.status === "declined" ? "Revise bid" : "Edit bid"}
        </button>
        <p className="text-xs text-muted">You can revise until the request closes. The customer sees every revision.</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="request_id" value={requestId} />
      {bid && <input type="hidden" name="bid_id" value={bid.id} />}
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span>Price <span className="unit">KWD</span></span>
          <input id="price" name="price" type="number" min="1" step="1" required className="input input-number" defaultValue={bid?.price ?? ""} autoFocus={!!bid} />
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
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={pending}>
          {pending ? "Saving…" : bid ? "Save changes" : "Place bid"}
        </button>
        {bid && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        {bid ? "Saving counts as a new revision; the customer sees every one." : "You can revise until the request closes. The customer sees every revision."}
      </p>
    </form>
  );
}
