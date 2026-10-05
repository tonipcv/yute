import { PlaygroundTool } from "@/components/playground-tool";

export const metadata = { title: "Email lookup - yute" };

export default function LookupPage() {
  return (
    <PlaygroundTool
      queryType="email"
      title="Email Lookup"
      subtitle="Resolve a person by email. Validation runs before delivery: syntax, domain and MX, so you get a deliverable flag, not a guess."
      endpoint="/v1/lookup?email="
      label="Email"
      placeholder="leo@example.com"
      samples={["leo@example.com", "maria@google.com", "test@no-mx-domain-xyz123.com"]}
    />
  );
}
