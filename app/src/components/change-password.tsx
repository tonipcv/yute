"use client";

import { useActionState } from "react";
import { updatePasswordAction, type ChangePasswordState } from "@/actions/auth";

const inputCls =
  "flex h-10 w-full rounded-none border border-[#D9D8CF] bg-[#FFFFFA] px-3 py-2 text-sm text-[#11130f] transition-colors placeholder:text-[#b6b5ab] focus-visible:border-[#173D2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DDE6CF]";

export function ChangePassword() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(updatePasswordAction, { ok: false });

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4" style={{ width: "100%" }}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="current" className="text-xs font-medium text-[#555951]">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new" className="text-xs font-medium text-[#555951]">New password (8+ characters)</label>
        <input id="new" name="new" type="password" autoComplete="new-password" required className={inputCls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-xs font-medium text-[#555951]">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputCls} />
      </div>
      {state?.error ? <div className="border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{state.error}</div> : null}
      {state?.ok ? <div className="border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">Password changed.</div> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-fit items-center justify-center bg-[#173D2D] px-4 text-sm font-medium text-white transition hover:bg-[#0F2F22] disabled:opacity-60"
      >
        {pending ? "Please wait..." : "Change password"}
      </button>
    </form>
  );
}
