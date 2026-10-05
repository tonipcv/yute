import { PlaygroundTool } from "@/components/playground-tool";

export const metadata = { title: "Name lookup - yute" };

export default function NamePage() {
  return (
    <PlaygroundTool
      queryType="name"
      title="Name Lookup"
      subtitle="Resolve a person by full name. The live web worker fills role and company when it can verify them."
      endpoint="/v1/lookup?name="
      label="Full name"
      placeholder="Leo Almeida"
      samples={["Leo Almeida", "Ada Lovelace", "Toni Nascimento"]}
    />
  );
}
