"use client";

import { useActionState } from "react";
import { signInAction, signUpAction, type AuthState } from "@/actions/auth";

const inputCls =
  "flex h-10 w-full rounded-none border border-[#D9D8CF] bg-[#FFFFFA] px-3 py-2 text-sm text-[#11130f] transition-colors placeholder:text-[#b6b5ab] focus-visible:border-[#173D2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DDE6CF]";

export function AuthForm({ mode, google = false }: { mode: "signin" | "signup"; google?: boolean }) {
  const action = mode === "signin" ? signInAction : signUpAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" style={{ width: "100%" }}>
      {google ? (
        <>
          <a
            href="/api/auth/google/start"
            className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#D9D8CF] bg-[#FFFFFA] px-4 text-sm font-medium text-[#11130f] transition hover:border-[#173D2D]/60"
          >
            Continue with Google
          </a>
          <div className="flex items-center gap-3 text-[11px] uppercase text-[#a7a69c]">
            <span className="h-px flex-1 bg-[#E2E1D9]" />
            or
            <span className="h-px flex-1 bg-[#E2E1D9]" />
          </div>
        </>
      ) : null}

      {state?.error ? (
        <div className="border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{state.error}</div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-medium text-[#555951]">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="name@company.com"
          autoComplete="email"
          required
          autoFocus
          defaultValue={state?.email ?? ""}
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium text-[#555951]">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder={mode === "signin" ? "••••••••" : "8+ characters"}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center bg-[#173D2D] px-4 text-sm font-medium text-white transition hover:bg-[#0F2F22] disabled:opacity-60"
      >
        {pending ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
