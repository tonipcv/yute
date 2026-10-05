import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create your yute workspace" };

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[#F6F6F1] text-[#11130f] [font-family:Helvetica,Arial,sans-serif]">
      <section className="grid min-h-screen lg:grid-cols-2">
        <div className="relative order-last flex min-h-[42vh] items-center justify-center overflow-hidden bg-[#f0efe9] p-8 lg:order-first lg:min-h-screen">
          <div className="w-full max-w-[440px] border border-[#E2E1D9] bg-[#FFFFFA]">
            <div className="flex h-11 items-center justify-between border-b border-[#E2E1D9] px-4">
              <span className="text-sm font-medium">How yute resolves</span>
            </div>
            <div className="px-4 py-4 text-sm leading-6 text-[#555951]">
              <ol className="flex flex-col gap-2">
                <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center border border-[#E2E1D9] bg-[#F6F6F1] font-mono text-[10px] text-[#173D2D]">1</span> You ask with an email, a domain, or a name.</li>
                <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center border border-[#E2E1D9] bg-[#F6F6F1] font-mono text-[10px] text-[#173D2D]">2</span> Live web search resolves it first - no credit burn.</li>
                <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center border border-[#E2E1D9] bg-[#F6F6F1] font-mono text-[10px] text-[#173D2D]">3</span> Every email is validated before it reaches you.</li>
                <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center border border-[#E2E1D9] bg-[#F6F6F1] font-mono text-[10px] text-[#173D2D]">4</span> Only what the web can't answer goes to providers - after validation.</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="order-first flex min-h-[58vh] items-center justify-center px-5 py-12 lg:order-last lg:min-h-screen lg:py-16">
          <div className="w-full max-w-[420px] border border-[#D9D8CF] bg-[#FFFFFA] p-6">
            <p className="text-[11px] font-medium uppercase text-[#777970]">yute access</p>
            <h1 className="mt-2 text-3xl font-medium tracking-normal">Create workspace</h1>
            <p className="mt-2 text-sm leading-6 text-[#555951]">Email + password. Keys and logs stay yours.</p>
            <div className="mt-6">
              <AuthForm mode="signup" google={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
            </div>
            <div className="mt-6 border-t border-[#E2E1D9] pt-5 text-sm text-[#555951]">
              Already have one? <Link href="/login" className="text-[#173D2D] hover:underline">Sign in</Link>.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
