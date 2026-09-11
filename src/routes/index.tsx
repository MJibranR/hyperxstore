import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Lock, ShieldAlert, Fingerprint } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getHwid, maskHwid } from "@/lib/hwid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HYPERXSTORE — Claim Your License Key" },
      {
        name: "description",
        content:
          "Enter your access code to instantly claim your license key. One key per device, per batch.",
      },
      { property: "og:title", content: "HYPERXSTORE — Claim Your License Key" },
      {
        property: "og:description",
        content: "Enter your access code to instantly claim your license key.",
      },
    ],
  }),
  component: Index,
});

type ClaimResult = {
  ok: boolean;
  error?: string;
  key_value?: string;
  expires_at?: string | null;
  status?: "claimed" | "expired" | "revoked";
  discord_invite_url?: string | null;
  reused?: boolean;
};

const ERRORS: Record<string, string> = {
  invalid_code: "That access code isn't valid right now.",
  no_keys: "No keys available — please contact the admin.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  bad_hwid: "Couldn't identify this device. Try a different browser.",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Never expires";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const LOGO_URL =
  "https://cdn.discordapp.com/icons/1521801218413035571/4cd6a3ea68c1397bd012caa1cde4124d.webp?size=240&quality=lossless";

function Index() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [hwid, setHwid] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const fingerprint = await getHwid();
      setHwid(fingerprint);
      const { data, error: rpcError } = await supabase.rpc("claim_key", {
        p_login_code: code.trim(),
        p_hwid: fingerprint,
      });
      if (rpcError) throw rpcError;
      const payload = data as unknown as ClaimResult;
      if (!payload?.ok) {
        setError(ERRORS[payload?.error ?? ""] ?? "Something went wrong. Try again.");
        return;
      }
      setResult(payload);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    if (!result?.key_value) return;
    try {
      await navigator.clipboard.writeText(result.key_value);
      setCopied(true);
      toast.success("Key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select the key manually");
    }
  }

  const isExpired = result?.status === "expired";
  const isRevoked = result?.status === "revoked";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-14">
      <div className="grid-mask pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative w-full max-w-lg">
        <header className="mb-9 text-center">
          {/* LOGO + NAME */}
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="glow relative flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-primary/25 ring-1 ring-primary/40">
              <img
                src={LOGO_URL}
                alt="HYPERXSTORE logo"
                className="size-full object-cover"
                loading="eager"
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              HYPER<span className="text-accent">X</span>STORE
            </h1>
          </div>

          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/20">
            <KeyRound className="size-6 text-accent" />
          </div>

          <h2 className="text-gradient text-3xl font-bold tracking-tight sm:text-4xl">
            Key Access Portal
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Enter your access code. One key is locked to your device per batch.
          </p>
        </header>

        {!result ? (
          <form
            onSubmit={handleSubmit}
            className="glass animate-rise-in rounded-3xl p-6 sm:p-8"
            aria-label="Access code"
          >
            <label
              htmlFor="code"
              className="mb-2 block text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
            >
              Access code
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter your login code"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-14 rounded-2xl border-input bg-background/50 pl-11 font-mono text-base tracking-wide focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {error && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2.5 text-sm text-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading || !code.trim()}
              className="glow mt-6 h-13 w-full rounded-2xl bg-primary text-base font-semibold tracking-wide transition-transform hover:bg-accent hover:text-accent-foreground active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Verifying device…
                </>
              ) : (
                "Unlock my key"
              )}
            </Button>

            <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
              Your device signature is generated on the fly and verified server-side. Nothing is
              stored in your browser.
            </p>
          </form>
        ) : (
          <div className="animate-rise-in space-y-4">
            <section className="glass-strong animate-pulse-glow rounded-3xl p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Your key
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ${
                    isExpired || isRevoked
                      ? "bg-destructive/20 text-destructive"
                      : "bg-success/15 text-success"
                  }`}
                >
                  {isRevoked ? "Revoked" : isExpired ? "Expired" : "Active"}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-input bg-background/55 p-4 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 font-mono text-lg break-all text-accent select-all">
                  {result.key_value}
                </code>
                <Button
                  onClick={copyKey}
                  variant="secondary"
                  className="h-11 shrink-0 rounded-xl border border-input bg-secondary font-semibold hover:bg-primary hover:text-primary-foreground"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/35 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Expires on</dt>
                  <dd className="mt-0.5 font-semibold">{formatDate(result.expires_at)}</dd>
                </div>
                <div className="rounded-xl border border-border bg-background/35 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Batch status</dt>
                  <dd className="mt-0.5 font-semibold">
                    {result.reused ? "Previously claimed" : "Newly assigned"}
                  </dd>
                </div>
              </dl>

              {(isExpired || isRevoked) && (
                <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2.5 text-sm">
                  This key is no longer valid. Contact the admin for a replacement.
                </p>
              )}

              {result.discord_invite_url && (
                <a
                  href={result.discord_invite_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="glow mt-6 flex h-13 w-full items-center justify-center gap-2.5 rounded-2xl bg-discord text-base font-semibold text-discord-foreground transition-transform hover:bg-primary active:scale-[0.99]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.2.36-.43.845-.588 1.23a18.27 18.27 0 0 0-5.594 0A12.4 12.4 0 0 0 9.11 3 19.74 19.74 0 0 0 4.677 4.372C1.9 8.52 1.146 12.6 1.523 16.62a19.9 19.9 0 0 0 6.073 3.058c.47-.64.888-1.32 1.247-2.035a12.9 12.9 0 0 1-1.964-.94c.165-.12.326-.246.481-.375 3.79 1.75 7.885 1.75 11.63 0 .157.13.318.255.483.375-.627.37-1.286.686-1.968.94.36.714.777 1.394 1.247 2.034a19.86 19.86 0 0 0 6.075-3.057c.443-4.65-.756-8.694-3.51-12.25ZM8.68 14.18c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.95-2.42 2.157-2.42 1.216 0 2.18 1.096 2.158 2.42 0 1.335-.95 2.42-2.158 2.42Zm6.64 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.95-2.42 2.157-2.42 1.217 0 2.18 1.096 2.158 2.42 0 1.335-.94 2.42-2.158 2.42Z" />
                  </svg>
                  Join our Discord
                </a>
              )}
            </section>

            <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <Fingerprint className="size-3.5" />
              Device ID <span className="font-mono">{maskHwid(hwid)}</span>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
