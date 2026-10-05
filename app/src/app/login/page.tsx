import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Mark } from "@/components/mark";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Sign in - yute" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;

  return (
    <main className="min-h-screen bg-[#F6F6F1] text-[#11130f] [font-family:Helvetica,Arial,sans-serif]">
      <section className="grid min-h-screen lg:grid-cols-2">
        <div className="relative order-last flex min-h-[42vh] items-center justify-center overflow-hidden bg-[#f0efe9] p-8 lg:order-first lg:min-h-screen">
          <div className="w-full max-w-[440px] border border-[#E2E1D9] bg-[#FFFFFA]">
            <div className="flex h-11 items-center gap-2 border-b border-[#E2E1D9] px-4">
              <span className="block h-3.5 w-2.5 text-[#11130f]"><Mark /></span>
              <span className="font-mono text-xs text-[#555951]">yute / v1 / lookup</span>
            </div>
            <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-6 text-[#33362f]">{`GET /v1/lookup?email=leo@example.com
Authorization: Bearer yute_...

200 OK
{
  "query": { "type": "email" },
  "resolved": {
    "deliverable": true,
    "domain": "example.com",
    "mx": 3
  }
}`}</pre>
          </div>
        </div>

        <div className="order-first flex min-h-[58vh] items-center justify-center px-5 py-12 lg:order-last lg:min-h-screen lg:py-16">
          <div className="w-full max-w-[420px] border border-[#D9D8CF] bg-[#FFFFFA] p-6">
            <p className="text-[11px] font-medium uppercase text-[#777970]">yute access</p>
            <h1 className="mt-2 text-3xl font-medium tracking-normal">Sign in</h1>
            <p className="mt-2 text-sm leading-6 text-[#555951]">Continue to your workspace dashboard.</p>

            {expired ? (
              <div className="mt-5 border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                Your session expired. Sign in again to continue.
              </div>
            ) : null}

            <div className="mt-6">
              <AuthForm mode="signin" google={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
            </div>

            <div className="mt-3 text-right text-xs">
              <Link href="/forgot-password" className="text-[#555951] hover:text-[#11130f] hover:underline">
                Forgot password?
              </Link>
            </div>

            <div className="mt-6 border-t border-[#E2E1D9] pt-5 text-sm text-[#555951]">
              First time? <Link href="/register" className="text-[#173D2D] hover:underline">Create a workspace</Link>.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
