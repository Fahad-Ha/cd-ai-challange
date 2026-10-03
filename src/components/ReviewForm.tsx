"use client";

import { useActionState } from "react";
import { postReview, type ActionState } from "@/app/orders/actions";

export function ReviewForm({ orderId, tailorId }: { orderId: string; tailorId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(postReview, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="tailor_id" value={tailorId} />
      <fieldset>
        <legend className="text-sm font-semibold">Rating</legend>
        <div className="mt-2 flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="relative cursor-pointer rounded-field border-[1.5px] border-line px-3 py-2 text-lg leading-none has-[:checked]:border-pencil has-[:checked]:bg-pencil-soft">
              <input type="radio" name="rating" value={n} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" required aria-label={`${n} star${n === 1 ? "" : "s"}`} />
              <span aria-hidden="true">{"★".repeat(n)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>Comment</span>
        <textarea id="comment" name="comment" className="input min-h-24" maxLength={2000} placeholder="Fit, finish, communication, timing." />
      </label>
      {state.error && <p role="alert" className="alert alert-error text-sm">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Posting…" : "Post review"}</button>
    </form>
  );
}
