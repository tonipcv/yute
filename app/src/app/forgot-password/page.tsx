"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ResetRequestState } from "@/actions/password-reset";

const inputCls =
  "flex h-10 w-full rounded-none border border-[#D9D8CF] bg-[#FFFFFA] px-3 py-2 text-sm text-[#11130f] placeholder:text-[#b6b5ab] focus-visible:border-[#173D2D] focus-visible:outline-none";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(requestPasswordReset, undefined);

  return (
    <main className="min-h-screen bg-[#F6F6F1] text-[#11130f] [font-family:Helvetica,Arial,sans-serif]">
      <div className="mx-auto flex min-h-screen max-w-[420px] items-center px-5">
        <div className="w-full border border-[#D9D8CF] bg-[#FFFFFA] p-6">
          <p className="text-[11px] font-medium uppercase text-[#777970]">yute access</p>
          <h1 className="mt-2 text-3xl font-medium">Forgot password</h1>
          <p className="mt-2 text-sm text-[#555951]">We&apos;ll email you a link to choose a new one.</p>

          {state?.message ? <div className="mt-5 border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">{state.message}</div> : null}
          {state?.error ? <div className="mt-5 border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{state.error}</div> : null}

          <form action={action} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-[#555951]">Email</label>
              <input id="email" name="email" type="email" required autoFocus className={inputCls} placeholder="name@company.com" />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 w-full items-center justify-center bg-[#173D2D] px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Sending..." : "Send reset link"}
            </button>
          </form>

          <div className="mt-6 border-t border-[#E2E1D9] pt-5 text-sm text-[#555951]">
            <Link href="/login" className="text-[#173D2D] hover:underline">Back to sign in</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
