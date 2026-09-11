import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  KeyRound,
  ListFilter,
  Loader2,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { maskHwid } from "@/lib/hwid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — Key Distribution Control" },
      { name: "description", content: "Manage access codes, license keys and claims." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin — Key Distribution Control" },
      { property: "og:description", content: "Manage access codes, license keys and claims." },
    ],
  }),
  component: AdminPage,
});

type LoginCode = { id: string; code: string; is_active: boolean; created_at: string };
type KeyRow = {
  id: string;
  key_value: string;
  login_code: string;
  status: string;
  expires_at: string | null;
  claimed_by_hwid: string | null;
  claimed_at: string | null;
  created_at: string;
};
type ClaimRow = {
  id: string;
  hwid: string;
  login_code: string;
  created_at: string;
  key_id: string;
  keys: { key_value: string; expires_at: string | null } | null;
};
type SettingsRow = {
  id: string;
  current_login_code: string | null;
  discord_invite_url: string;
};

const STATUSES = ["all", "available", "claimed", "expired", "revoked"] as const;

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function effectiveStatus(k: KeyRow) {
  if (k.status === "revoked") return "revoked";
  if (k.expires_at && new Date(k.expires_at) <= new Date()) return "expired";
  return k.status;
}

function statusClass(status: string) {
  if (status === "available") return "bg-success/15 text-success";
  if (status === "claimed") return "bg-primary/25 text-accent";
  if (status === "expired") return "bg-warning/15 text-warning";
  return "bg-destructive/20 text-destructive";
}

/* ------------------------------- page shell ------------------------------- */

function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const evaluate = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setSignedIn(false);
      setIsAdmin(false);
      setChecking(false);
      return;
    }
    setSignedIn(true);
    const { data: claimed } = await supabase.rpc("claim_admin");
    setIsAdmin(Boolean(claimed));
    setChecking(false);
  }, []);

  useEffect(() => {
    void evaluate();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void evaluate();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-7 animate-spin text-accent" />
      </div>
    );
  }

  if (!signedIn) return <AdminAuth />;

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass max-w-md rounded-3xl p-8 text-center">
          <h1 className="text-xl font-semibold">Not an admin account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This account has no admin access. Sign in with the admin account.
          </p>
          <Button
            variant="secondary"
            className="mt-6 rounded-xl"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}

/* ---------------------------------- auth ---------------------------------- */

function AdminAuth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-14">
      <form onSubmit={submit} className="glass w-full max-w-md rounded-3xl p-8">
        <div className="glow mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/25">
          <ShieldCheck className="size-6 text-accent" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Admin access</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to manage codes and keys."
            : "Create the admin account. The first account registered becomes admin."}
        </p>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl bg-background/50"
            />
          </div>
        </div>

        {notice && (
          <p className="mt-4 rounded-xl border border-input bg-background/50 px-3 py-2.5 text-sm">
            {notice}
          </p>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="glow mt-6 h-12 w-full rounded-xl bg-primary font-semibold hover:bg-accent hover:text-accent-foreground"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {mode === "signin" ? "Sign in" : "Create admin account"}
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
        >
          {mode === "signin"
            ? "No admin account yet? Create one"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}

/* -------------------------------- dashboard ------------------------------- */

function AdminDashboard() {
  const [codes, setCodes] = useState<LoginCode[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [c, k, cl, s] = await Promise.all([
      supabase.from("login_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("keys").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase
        .from("claims")
        .select("id, hwid, login_code, created_at, key_id, keys(key_value, expires_at)")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("settings").select("*").limit(1).maybeSingle(),
    ]);
    if (c.data) setCodes(c.data as LoginCode[]);
    if (k.data) setKeys(k.data as KeyRow[]);
    if (cl.data) setClaims(cl.data as unknown as ClaimRow[]);
    if (s.data) setSettings(s.data as SettingsRow);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-gradient text-3xl font-bold tracking-tight">Control Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active code:{" "}
            <span className="font-mono text-accent">{settings?.current_login_code ?? "none"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="size-4 animate-spin text-accent" />}
          <Button variant="secondary" className="rounded-xl" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </header>

      <Tabs defaultValue="keys">
        <TabsList className="glass mb-6 h-auto flex-wrap gap-1 rounded-2xl p-1.5">
          <TabsTrigger
            value="codes"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-primary"
          >
            <BadgeCheck className="size-4" /> Login codes
          </TabsTrigger>
          <TabsTrigger value="keys" className="rounded-xl px-4 py-2 data-[state=active]:bg-primary">
            <KeyRound className="size-4" /> Keys
          </TabsTrigger>
          <TabsTrigger
            value="claims"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-primary"
          >
            <ListFilter className="size-4" /> Claims log
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="rounded-xl px-4 py-2 data-[state=active]:bg-primary"
          >
            <SettingsIcon className="size-4" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="codes">
          <CodesTab codes={codes} settings={settings} keys={keys} refresh={refresh} />
        </TabsContent>
        <TabsContent value="keys">
          <KeysTab keys={keys} codes={codes} settings={settings} refresh={refresh} />
        </TabsContent>
        <TabsContent value="claims">
          <ClaimsTab claims={claims} codes={codes} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab settings={settings} refresh={refresh} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

/* -------------------------------- codes tab ------------------------------- */

function CodesTab({
  codes,
  settings,
  keys,
  refresh,
}: {
  codes: LoginCode[];
  settings: SettingsRow | null;
  keys: KeyRow[];
  refresh: () => Promise<void>;
}) {
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function activate(code: string) {
    if (!settings) return;
    setBusy(true);
    const { error } = await supabase
      .from("settings")
      .update({ current_login_code: code, updated_at: new Date().toISOString() })
      .eq("id", settings.id);
    if (error) toast.error(error.message);
    else {
      await supabase.from("login_codes").update({ is_active: false }).neq("code", code);
      await supabase.from("login_codes").update({ is_active: true }).eq("code", code);
      toast.success(`"${code}" is now the active batch`);
      await refresh();
    }
    setBusy(false);
  }

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    const value = newCode.trim();
    if (!value) return;
    setBusy(true);
    const { error } = await supabase.from("login_codes").insert({ code: value });
    if (error) toast.error(error.message);
    else {
      setNewCode("");
      await activate(value);
    }
    setBusy(false);
  }

  async function toggleActive(row: LoginCode) {
    setBusy(true);
    const { error } = await supabase
      .from("login_codes")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else await refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createCode} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold">New login code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creating a code makes it the active batch immediately. Devices can then claim one key from
          it.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="e.g. Hypeee1974"
            className="h-12 rounded-xl bg-background/50 font-mono"
          />
          <Button
            type="submit"
            disabled={busy || !newCode.trim()}
            className="glow h-12 rounded-xl bg-primary font-semibold hover:bg-accent hover:text-accent-foreground"
          >
            <Plus className="size-4" /> Create &amp; activate
          </Button>
        </div>
      </form>

      <div className="glass overflow-hidden rounded-3xl">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-xs tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-5 py-3 text-left">Code</th>
              <th className="px-5 py-3 text-left">Created</th>
              <th className="px-5 py-3 text-left">Keys</th>
              <th className="px-5 py-3 text-left">State</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((row) => {
              const batchKeys = keys.filter((k) => k.login_code === row.code);
              const available = batchKeys.filter((k) => effectiveStatus(k) === "available").length;
              const isCurrent = settings?.current_login_code === row.code;
              return (
                <tr key={row.id} className="border-t border-border/70">
                  <td className="px-5 py-3 font-mono text-accent">{row.code}</td>
                  <td className="px-5 py-3 text-muted-foreground">{fmt(row.created_at)}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {available} available / {batchKeys.length} total
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                        isCurrent
                          ? "bg-success/15 text-success"
                          : row.is_active
                            ? "bg-primary/25 text-accent"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCurrent ? "Active batch" : row.is_active ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {!isCurrent && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-lg"
                          disabled={busy}
                          onClick={() => void activate(row.code)}
                        >
                          Make active
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg"
                        disabled={busy}
                        onClick={() => void toggleActive(row)}
                      >
                        {row.is_active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {codes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  No login codes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------- keys tab ------------------------------- */

function KeysTab({
  keys,
  codes,
  settings,
  refresh,
}: {
  keys: KeyRow[];
  codes: LoginCode[];
  settings: SettingsRow | null;
  refresh: () => Promise<void>;
}) {
  const [bulk, setBulk] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extendDays, setExtendDays] = useState("30");

  const targetBatch = batch || settings?.current_login_code || "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keys.filter((k) => {
      if (q && !k.key_value.toLowerCase().includes(q) && !(k.claimed_by_hwid ?? "").includes(q))
        return false;
      if (status !== "all" && effectiveStatus(k) !== status) return false;
      if (batchFilter !== "all" && k.login_code !== batchFilter) return false;
      if (from && new Date(k.created_at) < new Date(from)) return false;
      if (to && new Date(k.created_at) > new Date(`${to}T23:59:59`)) return false;
      return true;
    });
  }, [keys, query, status, batchFilter, from, to]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addKeys(e: React.FormEvent) {
    e.preventDefault();
    const values = bulk
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) return;
    if (!targetBatch) {
      toast.error("No active login code — create one first.");
      return;
    }
    setBusy(true);
    const rows = values.map((key_value) => ({
      key_value,
      login_code: targetBatch,
      expires_at: expiry ? new Date(`${expiry}T23:59:59`).toISOString() : null,
    }));
    const { error } = await supabase.from("keys").insert(rows);
    if (error) toast.error(error.message);
    else {
      toast.success(`${rows.length} key(s) added to ${targetBatch}`);
      setBulk("");
      await refresh();
    }
    setBusy(false);
  }

  async function act(ids: string[], action: "delete" | "revoke" | "reset" | "extend") {
    if (ids.length === 0) return;
    setBusy(true);
    let error = null;
    if (action === "delete") {
      ({ error } = await supabase.from("keys").delete().in("id", ids));
    } else if (action === "revoke") {
      ({ error } = await supabase.from("keys").update({ status: "revoked" }).in("id", ids));
    } else if (action === "reset") {
      await supabase.from("claims").delete().in("key_id", ids);
      ({ error } = await supabase
        .from("keys")
        .update({ status: "available", claimed_by_hwid: null, claimed_at: null })
        .in("id", ids));
    } else {
      const days = Number(extendDays) || 30;
      for (const id of ids) {
        const row = keys.find((k) => k.id === id);
        const base = row?.expires_at ? new Date(row.expires_at) : new Date();
        const next = new Date(Math.max(base.getTime(), Date.now()) + days * 86400000);
        const res = await supabase
          .from("keys")
          .update({ expires_at: next.toISOString() })
          .eq("id", id);
        if (res.error) error = res.error;
      }
    }
    if (error) toast.error(error.message);
    else {
      toast.success(`${ids.length} key(s) updated`);
      setSelected(new Set());
      await refresh();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={addKeys} className="glass rounded-3xl p-6">
        <h2 className="text-lg font-semibold">Add keys</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste one key per line. They are assigned to the selected batch.
        </p>
        <Textarea
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          rows={5}
          placeholder={"KEY-AAAA-1111\nKEY-BBBB-2222"}
          className="mt-4 rounded-2xl bg-background/50 font-mono"
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Batch (login code)</Label>
            <select
              value={targetBatch}
              onChange={(e) => setBatch(e.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-background/60 px-3 font-mono text-sm"
            >
              {codes.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Expiry date (blank = never)</Label>
            <Input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="h-11 rounded-xl bg-background/50"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy || !bulk.trim()}
              className="glow h-11 w-full rounded-xl bg-primary font-semibold hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="size-4" /> Add keys
            </Button>
          </div>
        </div>
      </form>

      <div className="glass rounded-3xl p-6">
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">
            <Label>Search key or device ID</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="KEY-… or hwid hash"
                className="h-11 rounded-xl bg-background/50 pl-9 font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
              className="h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm capitalize"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Batch</Label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
            >
              <option value="all">All batches</option>
              {codes.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-11 rounded-xl bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-11 rounded-xl bg-background/50"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/70 pt-5">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected · {filtered.length} shown
          </span>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Input
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              className="h-9 w-20 rounded-lg bg-background/50"
              aria-label="Days to extend"
            />
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg"
              disabled={busy || selected.size === 0}
              onClick={() => void act([...selected], "extend")}
            >
              <CalendarClock className="size-4" /> Extend
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg"
              disabled={busy || selected.size === 0}
              onClick={() => void act([...selected], "reset")}
            >
              <RotateCcw className="size-4" /> Reset
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-lg"
              disabled={busy || selected.size === 0}
              onClick={() => void act([...selected], "revoke")}
            >
              <Ban className="size-4" /> Revoke
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="rounded-lg"
              disabled={busy || selected.size === 0}
              onClick={() => void act([...selected], "delete")}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="glass overflow-x-auto rounded-3xl">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-background/40 text-xs tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">
                <Checkbox
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onCheckedChange={(v) =>
                    setSelected(v ? new Set(filtered.map((k) => k.id)) : new Set())
                  }
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 text-left">Key</th>
              <th className="px-4 py-3 text-left">Batch</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Device</th>
              <th className="px-4 py-3 text-left">Claimed</th>
              <th className="px-4 py-3 text-left">Expires</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => {
              const st = effectiveStatus(k);
              return (
                <tr key={k.id} className="border-t border-border/70">
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selected.has(k.id)}
                      onCheckedChange={() => toggle(k.id)}
                      aria-label={`Select ${k.key_value}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-accent">{k.key_value}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {k.login_code}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${statusClass(st)}`}
                    >
                      {st}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {maskHwid(k.claimed_by_hwid)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(k.claimed_at)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {k.expires_at ? fmt(k.expires_at) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 rounded-lg"
                        title="Extend expiry"
                        disabled={busy}
                        onClick={() => void act([k.id], "extend")}
                      >
                        <CalendarClock className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 rounded-lg"
                        title="Reset to available"
                        disabled={busy}
                        onClick={() => void act([k.id], "reset")}
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 rounded-lg"
                        title="Revoke"
                        disabled={busy}
                        onClick={() => void act([k.id], "revoke")}
                      >
                        <Ban className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 rounded-lg text-destructive"
                        title="Delete"
                        disabled={busy}
                        onClick={() => void act([k.id], "delete")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No keys match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------- claims tab ------------------------------ */

function ClaimsTab({ claims, codes }: { claims: ClaimRow[]; codes: LoginCode[] }) {
  const [query, setQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter((c) => {
      if (
        q &&
        !c.hwid.toLowerCase().includes(q) &&
        !(c.keys?.key_value ?? "").toLowerCase().includes(q)
      )
        return false;
      if (batchFilter !== "all" && c.login_code !== batchFilter) return false;
      if (from && new Date(c.created_at) < new Date(from)) return false;
      if (to && new Date(c.created_at) > new Date(`${to}T23:59:59`)) return false;
      return true;
    });
  }, [claims, query, batchFilter, from, to]);

  return (
    <div className="space-y-6">
      <div className="glass grid gap-4 rounded-3xl p-6 lg:grid-cols-4">
        <div className="space-y-2 lg:col-span-2">
          <Label>Search device ID or key</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 rounded-xl bg-background/50 pl-9 font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Batch</Label>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="all">All batches</option>
            {codes.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 rounded-xl bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 rounded-xl bg-background/50"
            />
          </div>
        </div>
      </div>

      <div className="glass overflow-x-auto rounded-3xl">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-background/40 text-xs tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-5 py-3 text-left">Device ID</th>
              <th className="px-5 py-3 text-left">Key</th>
              <th className="px-5 py-3 text-left">Batch</th>
              <th className="px-5 py-3 text-left">Claimed at</th>
              <th className="px-5 py-3 text-left">Expires</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-border/70">
                <td className="px-5 py-3 font-mono text-xs">{maskHwid(c.hwid)}</td>
                <td className="px-5 py-3 font-mono text-accent">{c.keys?.key_value ?? "—"}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                  {c.login_code}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{fmt(c.created_at)}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {c.keys?.expires_at ? fmt(c.keys.expires_at) : "Never"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  No claims match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- settings tab ----------------------------- */

function SettingsTab({
  settings,
  refresh,
}: {
  settings: SettingsRow | null;
  refresh: () => Promise<void>;
}) {
  const [url, setUrl] = useState(settings?.discord_invite_url ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(settings?.discord_invite_url ?? "");
  }, [settings?.discord_invite_url]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    const { error } = await supabase
      .from("settings")
      .update({ discord_invite_url: url.trim(), updated_at: new Date().toISOString() })
      .eq("id", settings.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Discord link saved");
      await refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="glass max-w-xl rounded-3xl p-6">
      <h2 className="text-lg font-semibold">Discord invite</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown to users right after their key is revealed.
      </p>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://discord.gg/yourinvite"
        className="mt-4 h-12 rounded-xl bg-background/50"
      />
      <Button
        type="submit"
        disabled={busy}
        className="glow mt-5 h-11 rounded-xl bg-primary font-semibold hover:bg-accent hover:text-accent-foreground"
      >
        {busy && <Loader2 className="size-4 animate-spin" />} Save
      </Button>
    </form>
  );
}
