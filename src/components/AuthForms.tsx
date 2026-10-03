"use client";

import { useActionState } from "react";
import Link from "next/link";
import { logIn, signUp, type AuthState } from "@/app/(auth)/actions";

const initial: AuthState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  return (
    <form action={action} className="card-raised grid gap-4">
      <label className="field">
        <span>Name</span>
        <input id="display_name" name="display_name" className="input" required maxLength={80} autoComplete="name" />
      </label>
      <label className="field">
        <span>Email</span>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input id="password" name="password" type="password" className="input" required minLength={8} autoComplete="new-password" />
      </label>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">I am a</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-field border-[1.5px] border-line px-3 py-2 has-[:checked]:border-customer has-[:checked]:bg-customer-soft">
            <input type="radio" name="role" value="customer" required /> Customer
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-field border-[1.5px] border-line px-3 py-2 has-[:checked]:border-tailor has-[:checked]:bg-tailor-soft">
            <input type="radio" name="role" value="tailor" /> Tailor
          </label>
        </div>
        <p className="text-xs text-muted">This cannot be changed later.</p>
      </fieldset>
      {state.error && <p role="alert" className="alert alert-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      <p className="text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-pencil">Log in</Link></p>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(logIn, initial);
  return (
    <form action={action} className="card-raised grid gap-4">
      <label className="field">
        <span>Email</span>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
      </label>
      {state.error && <p role="alert" className="alert alert-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Logging in…" : "Log in"}</button>
      <p className="text-center text-sm text-muted">New here? <Link href="/signup" className="font-semibold text-pencil">Create an account</Link></p>
    </form>
  );
}
