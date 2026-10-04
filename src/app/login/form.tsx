"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="label" htmlFor="password">
        Adgangskode
      </label>
      <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="field" />
      {state?.error && <p className="text-sm text-warm">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Logger ind…" : "Log ind"}
      </button>
    </form>
  );
}
