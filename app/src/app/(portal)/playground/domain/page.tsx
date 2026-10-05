import { PlaygroundTool } from "@/components/playground-tool";

export const metadata = { title: "Domain lookup - yute" };

export default function DomainPage() {
  return (
    <PlaygroundTool
      queryType="domain"
      title="Domain Lookup"
      subtitle="Resolve a company by its web domain. Checks whether the domain accepts mail at all before you route a person lookup at it."
      endpoint="/v1/lookup?domain="
      label="Domain"
      placeholder="stripe.com"
      samples={["stripe.com", "linear.app", "no-mx-domain-xyz123.com"]}
    />
  );
}
