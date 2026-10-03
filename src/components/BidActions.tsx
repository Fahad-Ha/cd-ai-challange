"use client";

import { useActionState } from "react";
import { acceptBid, declineBid, type BidActionState } from "@/app/customer/requests/actions";

interface Props {
  requestId: string;
  bid: { id: string; price: number; turnaround_days: number };
}

export function BidActions({ requestId, bid }: Props) {
  const [acceptState, accept, accepting] = useActionState<BidActionState, FormData>(acceptBid, {});
  const [declineState, decline, declining] = useActionState<BidActionState, FormData>(declineBid, {});
  const error = acceptState.error ?? declineState.error;
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <form action={accept}>
          <input type="hidden" name="bid_id" value={bid.id} />
          <input type="hidden" name="expected_price" value={bid.price} />
          <input type="hidden" name="expected_turnaround" value={bid.turnaround_days} />
          <button type="submit" className="btn btn-primary text-sm" disabled={accepting || declining}>
            {accepting ? "Accepting…" : "Accept"}
          </button>
        </form>
        <form action={decline}>
          <input type="hidden" name="bid_id" value={bid.id} />
          <input type="hidden" name="request_id" value={requestId} />
          <button type="submit" className="btn btn-danger text-sm" disabled={accepting || declining}>
            {declining ? "Declining…" : "Decline"}
          </button>
        </form>
      </div>
      {error && <p role="alert" className="alert alert-error text-sm">{error}</p>}
    </div>
  );
}
