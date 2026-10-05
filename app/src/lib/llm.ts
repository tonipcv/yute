import "server-only";

/**
 * Provider-agnostic LLM client for structured JSON extraction.
 * Select the operator with LLM_PROVIDER + the matching key. Swappable without a rebuild.
 *
 *   LLM_PROVIDER=gemini   GEMINI_API_KEY=...      GEMINI_MODEL=gemini-2.5-flash
 *   LLM_PROVIDER=groq     GROQ_API_KEY=...        GROQ_MODEL=llama-3.1-8b-instant
 *   LLM_PROVIDER=deepseek DEEPSEEK_API_KEY=...    DEEPSEEK_MODEL=deepseek-chat
 *   LLM_PROVIDER=openai   OPENAI_API_KEY=...      OPENAI_MODEL=gpt-4o-mini
 */

export interface LlmConfig {
  provider: "gemini" | "groq" | "deepseek" | "openai";
  apiKey: string;
  model: string;
}

export function llmConfig(): LlmConfig | null {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  const candidates: Array<[LlmConfig["provider"], string | undefined, string | undefined, string]> = [
    ["gemini", process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL, "gemini-2.5-flash"],
    ["groq", process.env.GROQ_API_KEY, process.env.GROQ_MODEL, "openai/gpt-oss-20b"],
    ["deepseek", process.env.DEEPSEEK_API_KEY, process.env.DEEPSEEK_MODEL, "deepseek-chat"],
    ["openai", process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL, "gpt-4o-mini"],
  ];
  const ordered = explicit ? [...candidates].sort((a, b) => (a[0] === explicit ? -1 : b[0] === explicit ? 1 : 0)) : candidates;
  for (const [provider, key, model, def] of ordered) {
    if (key) return { provider, apiKey: key, model: model || def };
  }
  return null;
}

export function isLlmConfigured(): boolean {
  return llmConfig() !== null;
}

/** Rough cost estimate in micro-USD from token counts (per-provider, per-1M tokens). */
function estimateCostMicroUsd(provider: LlmConfig["provider"], inTok: number, outTok: number): number {
  const rates: Record<LlmConfig["provider"], [number, number]> = {
    // [input $/1M, output $/1M] -> in micro-USD per token = rate/1e6 * 1e6 = rate
    gemini: [0.3, 2.5],
    groq: [0.15, 0.6],
    deepseek: [0.27, 1.1],
    openai: [0.15, 0.6],
  };
  const [inRate, outRate] = rates[provider];
  return Math.round(inTok * inRate + outTok * outRate);
}

interface ChatResult {
  content: string;
  costMicroUsd: number;
}

async function chatJson(cfg: LlmConfig, system: string, user: string): Promise<ChatResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    if (cfg.provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!content) return null;
      return {
        content,
        costMicroUsd: estimateCostMicroUsd(cfg.provider, json.usageMetadata?.promptTokenCount ?? 0, json.usageMetadata?.candidatesTokenCount ?? 0),
      };
    }

    // OpenAI-compatible (openai, groq, deepseek)
    const endpoints: Record<string, string> = {
      openai: "https://api.openai.com/v1/chat/completions",
      groq: "https://api.groq.com/openai/v1/chat/completions",
      deepseek: "https://api.deepseek.com/v1/chat/completions",
    };
    // Groq's open-weight models reject response_format on some accounts.
    const body: Record<string, unknown> = {
      model: cfg.model,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    if (cfg.provider !== "groq") body.response_format = { type: "json_object" };

    const res = await fetch(endpoints[cfg.provider], {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    return {
      content,
      costMicroUsd: estimateCostMicroUsd(cfg.provider, json.usage?.prompt_tokens ?? 0, json.usage?.completion_tokens ?? 0),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export { chatJson };
