import { PageTitle, Tabs } from "@/components/portal-ui";
import { ChangePassword } from "@/components/change-password";

export const metadata = { title: "Password - yute" };

export default function SettingsPasswordPage() {
  return (
    <main className="min-h-screen bg-[#F6F6F1] px-4 py-5 [font-family:Helvetica,Arial,sans-serif] lg:px-8">
      <div className="mx-auto max-w-6xl">
      <PageTitle eyebrow="Management" title="Settings" />
      <Tabs
        active="/settings/password"
        tabs={[
          { href: "/settings", label: "Profile" },
          { href: "/settings/password", label: "Password" },
        ]}
      />

      <div className="mt-6 max-w-xl border border-[#E2E1D9] bg-[#FFFFFA] p-4">
        <h2 className="text-sm font-medium text-[#11130f]">Change password</h2>
        <p className="mt-1 text-xs leading-5 text-[#555951]">
          Sessions are signed cookies - changing the password does not sign other devices out automatically.
        </p>
        <ChangePassword />
      </div>
      </div>
    </main>
  );
}
