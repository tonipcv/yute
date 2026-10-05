import "server-only";

export interface SerpResult {
  title: string;
  url: string;
  description: string;
  domain: string;
}

interface DataForSeoTask {
  status_code?: number;
  status_message?: string;
  result?: Array<{
    items?: Array<Record<string, unknown>>;
  }>;
}

export function isDataForSeoConfigured(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

/** Cost of one Live Google Organic SERP (10 results): $0.002. */
const SERP_COST_MICRO_USD = 2000;

export async function dataforseoSerp(
  keyword: string,
  opts: { locationCode?: number; language?: string; depth?: number; timeoutMs?: number; onResult?: (outcome: "result" | "miss" | "error", ms: number) => void } = {}
): Promise<{ results: SerpResult[]; costMicroUsd: number } | null> {
  const startedAt = Date.now();
  const done = (outcome: "result" | "miss" | "error") => opts.onResult?.(outcome, Date.now() - startedAt);
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    done("error");
    return null;
  }

  const locationCode = opts.locationCode ?? Number(process.env.YUTE_DFSEO_LOCATION ?? 2840);
  const language = opts.language ?? process.env.YUTE_DFSEO_LANGUAGE ?? "en";
  const depth = opts.depth ?? 10;
  const timeoutMs = opts.timeoutMs ?? 15000;

  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword,
          location_code: locationCode,
          language_code: language,
          device: "desktop",
          os: "windows",
          depth,
        },
      ]),
      signal: controller.signal,
    });

    if (!res.ok) {
      done("error");
      return null;
    }
    const json = (await res.json()) as { tasks?: DataForSeoTask[] };
    const task = json.tasks?.[0];
    if (!task || (task.status_code ?? 0) >= 40000) {
      done("error");
      return null;
    }

    const items = task.result?.[0]?.items ?? [];
    const results: SerpResult[] = [];
    for (const item of items) {
      if (item.type && item.type !== "organic") continue;
      const url = typeof item.url === "string" ? item.url : "";
      if (!url) continue;
      let domain = "";
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // ignore malformed urls
      }
      results.push({
        title: typeof item.title === "string" ? item.title : "",
        url,
        description: typeof item.description === "string" ? item.description : "",
        domain,
      });
    }

    done(results.length ? "result" : "miss");
    return { results, costMicroUsd: SERP_COST_MICRO_USD };
  } catch {
    done("error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
