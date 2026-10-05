"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff } from "lucide-react";
import { createKeyAction, revokeKeyAction } from "@/actions/keys";

export interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  scope: string;
  status: "active" | "revoked";
  createdAt: string;
  lastUsedAt?: string;
}

export function HomeKeyCard({ keys }: { keys: KeyRow[] }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const activeKey = keys.find((k) => k.status === "active") ?? keys[0] ?? null;
  const canReveal = Boolean(token);
  const displayKey = canReveal && showKey ? token : activeKey ? `${activeKey.prefix}${activeKey.last4}` : "No API key yet";

  async function createKey() {
    setCreating(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("name", `Lookup key ${keys.length + 1}`);
      formData.set("scope", "lookup:read");
      const result = await createKeyAction(formData);
      setToken(result.raw);
      setShowKey(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="border border-[#E2E1D9] bg-[#FFFFFA] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium text-[#11130f]">API Key</h2>
        <a href="/api-keys" className="text-xs font-medium text-[#555951] hover:text-[#11130f]">View all</a>
      </div>
      <div className="flex h-10 items-center justify-between gap-3 border border-[#E2E1D9] px-3 text-[11px] font-medium tracking-[0.08em] text-[#555951]">
        <span className="truncate">{displayKey}</span>
        <div className="flex shrink-0 items-center gap-3 text-[#777970]">
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            disabled={!canReveal}
            aria-label={showKey ? "Hide API key" : "Show API key"}
            title={canReveal ? (showKey ? "Hide API key" : "Show API key") : "Full key is only available right after creation"}
            className="disabled:cursor-not-allowed disabled:opacity-40"
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(token);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            disabled={!canReveal}
            aria-label="Copy API key"
            title={canReveal ? "Copy API key" : "Full key is only available right after creation"}
            className="disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <button
        onClick={createKey}
        disabled={creating}
        className="mt-3 w-full border border-[#E2E1D9] px-3 py-2 text-xs font-medium text-[#33362f] transition hover:border-[#173D2D]/60 disabled:opacity-60"
      >
        {creating ? "Creating..." : token ? "Create another key" : "Create Lookup key"}
      </button>
      {copied ? <p className="mt-2 text-xs text-[#173D2D]">Copied to clipboard.</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  );
}

export function KeysManager({ keys }: { keys: KeyRow[] }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createKey() {
    setCreating(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("name", `Lookup key ${keys.length + 1}`);
      formData.set("scope", "lookup:read");
      const result = await createKeyAction(formData);
      setToken(result.raw);
      setVisible(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    setError("");
    try {
      const formData = new FormData();
      formData.set("keyId", id);
      await revokeKeyAction(formData);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  }

  return (
    <>
      <div className="mt-8 flex items-end justify-between border-b border-[#E2E1D9]">
        <div className="flex gap-6">
          <span className="border-b-2 border-[#173D2D] py-3 text-sm font-medium text-[#173D2D]">API keys</span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <select
            className="h-10 border border-[#E2E1D9] bg-[#FFFFFA] px-3 text-sm text-[#33362f] outline-none"
            defaultValue="lookup:read"
            aria-label="Key scope"
          >
            <option value="lookup:read">Lookup API (person + validation)</option>
          </select>
          <button
            onClick={createKey}
            disabled={creating}
            className="bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {creating ? "Creating..." : "+ Create Key"}
          </button>
        </div>
      </div>

      {token ? (
        <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Copy this key now. It will only be shown once.</p>
          <div className="mt-4 flex items-center gap-3 bg-[#FFFFFA] px-4 py-3 font-mono text-sm text-emerald-800">
            <span className="min-w-0 flex-1 truncate">{token}</span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(token);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="border border-emerald-200 px-3 py-2 font-sans text-sm"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 overflow-hidden border border-[#E2E1D9]">
        <div className="grid grid-cols-[1.1fr_1.6fr_0.7fr_1fr_0.3fr] bg-[#F6F6F1] px-5 py-3 text-sm font-medium text-[#555951]">
          <span>Name</span>
          <span>Secret Key</span>
          <span>Scope</span>
          <span>Created</span>
          <span />
        </div>
        {keys.length ? (
          keys.map((key) => {
            const display = visible && token && key.status === "active" ? token : `${key.prefix}${key.last4}`;
            return (
              <div key={key.id} className="grid grid-cols-[1.1fr_1.6fr_0.7fr_1fr_0.3fr] items-center border-t border-[#E2E1D9] px-5 py-4 text-sm">
                <span className={key.status === "active" ? "" : "text-[#777970]"}>{key.name}</span>
                <span className="flex h-10 items-center justify-between gap-2 bg-[#F6F6F1] px-3 font-mono text-xs text-[#173D2D]">
                  <span className="min-w-0 truncate">{display}</span>
                  <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    disabled={!token || key.status !== "active"}
                    className="text-[#555951] hover:text-[#11130f] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={visible ? "Hide API key" : "Show API key"}
                    title={token ? (visible ? "Hide API key" : "Show API key") : "Full key is only available right after creation"}
                  >
                    {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
                <span className="text-[#555951]">{key.scope === "lookup:read" ? "Lookup" : key.scope}</span>
                <span>{new Date(key.createdAt).toLocaleString()}</span>
                {key.status === "revoked" ? (
                  <span className="text-xs text-[#777970]">revoked</span>
                ) : (
                  <button
                    onClick={() => void revokeKey(key.id)}
                    className="text-xs font-medium text-[#555951] hover:text-red-600"
                  >
                    revoke
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="px-5 py-5 text-sm text-[#555951]">No API keys yet. Create one above.</div>
        )}
      </div>
    </>
  );
}
