import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import { useSession } from "@/store/session";
import { useToasts } from "@/store/toast";
import { cx, formatBytes, relativeDate } from "@/lib/format";
import { RefreshIcon } from "@/components/Icons";
import type { AdminOverview, AdminSession } from "@/types";

export function Admin() {
  const profile = useSession((s) => s.profile);
  const push = useToasts((s) => s.push);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.adminOverview(), api.adminSessions()])
      .then(([overview, s]) => {
        setData(overview);
        setSessions(s.items);
      })
      .catch(() => push("Couldn't load the admin data", "error"));

  useEffect(() => {
    void load();
  }, []);

  const run = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await fn();
      push(message, "success");
      await load();
    } catch {
      push("That didn't work", "error");
    } finally {
      setBusy(null);
    }
  };

  if (!profile?.isAdmin) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 pt-[70px]">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="section-title mb-2">Admins only</h1>
          <p className="mb-5 text-sm text-muted">
            Ask an admin to grant you access, or run{" "}
            <code className="text-amber">npm --prefix backend run make-admin -- {profile?.name}</code>{" "}
            on the machine hosting SunFlix.
          </p>
          <Link to="/" className="btn-ghost">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-8">
        <div className="h-40 animate-pulse rounded-2xl bg-ink-700/60" />
      </div>
    );
  }

  const { catalog, storage, watch } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8 sm:pt-28">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-wide sm:text-4xl">Admin</h1>
          <p className="mt-1 text-sm text-muted">
            Last scan {catalog.lastScan ? relativeDate(catalog.lastScan) : "never"}
            {catalog.scanning && " · scanning now"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("check", () => api.adminCheckNow(), "Storage checked")}
            className="btn-ghost"
          >
            <RefreshIcon className="h-4 w-4" />
            {busy === "check" ? "Checking…" : "Check for new files"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("rescan", () => api.adminRescan(false), "Rescanned")}
            className="btn-ghost"
          >
            {busy === "rescan" ? "Scanning…" : "Rescan"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run("force", () => api.adminRescan(true), "Full re-fetch complete")
            }
            className="btn-primary"
          >
            {busy === "force" ? "Refetching…" : "Force re-fetch"}
          </button>
        </div>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Films" value={String(catalog.count)} />
        <Stat label="Library size" value={formatBytes(catalog.totalBytes)} />
        <Stat
          label="Open requests"
          value={String(data.openRequests)}
          href={data.openRequests > 0 ? "/requests" : undefined}
          tone={data.openRequests > 0 ? "amber" : undefined}
        />
        <Stat
          label="Without subtitles"
          value={String(catalog.noSubtitles)}
          tone={catalog.noSubtitles > 0 ? "amber" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Storage">
          <Row label="Driver" value={storage.driver} />
          <Row label="Location" value={storage.location} mono />
          <Row label="TMDB" value={data.tmdb} />
          <Row
            label="Auto-import"
            value={
              watch.enabled
                ? storage.driver === "local"
                  ? `filesystem events, ${watch.stableSeconds}s settle`
                  : `polling every ${watch.pollSeconds}s`
                : "disabled"
            }
          />
        </Panel>

        <Panel title="Needs attention">
          {catalog.unmatched.length === 0 &&
          catalog.unplayable.length === 0 &&
          catalog.missingArtwork === 0 ? (
            <p className="text-sm text-muted">Nothing — the library is clean.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {catalog.unmatched.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="text-amber">No TMDB match</span> — {m.title}
                  </span>
                  <MatchFixer id={m.id} onDone={load} />
                </li>
              ))}
              {catalog.unplayable.map((m) => (
                <li key={m.id} className="truncate">
                  <span className="text-amber">.{m.container} won't play in browsers</span> — {m.title}
                </li>
              ))}
              {catalog.missingArtwork > 0 && (
                <li>
                  <span className="text-amber">{catalog.missingArtwork}</span> without artwork
                </li>
              )}
            </ul>
          )}
        </Panel>

        <Panel title="Profiles">
          <ul className="flex flex-col gap-2">
            {data.profiles.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.isAdmin && <span className="chip !text-[10px] !text-amber">admin</span>}
                </span>
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        `admin-${p.id}`,
                        () => api.adminSetAdmin(p.id, !p.isAdmin),
                        `${p.name} ${p.isAdmin ? "is no longer" : "is now"} an admin`,
                      )
                    }
                    className="btn-ghost !px-3 !py-1 text-[11px]"
                  >
                    {p.isAdmin ? "Demote" : "Make admin"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        `revoke-${p.id}`,
                        () => api.adminRevokeProfile(p.id),
                        `Signed ${p.name} out everywhere`,
                      )
                    }
                    className="btn-ghost !px-3 !py-1 text-[11px]"
                  >
                    Sign out
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={`Active sessions (${sessions.length})`}>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted">Nobody signed in.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">{s.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {s.userAgent ?? "unknown device"} · {relativeDate(s.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      run(`s-${s.id}`, () => api.adminRevokeSession(s.token), "Session revoked")
                    }
                    className="btn-ghost !px-3 !py-1 text-[11px]"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {data.recentActivity.length > 0 && (
          <Panel title="Recent activity" className="lg:col-span-2">
            <ul className="flex flex-col gap-1.5 text-sm">
              {data.recentActivity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{a.who}</span> watched{" "}
                    <Link
                      to={`/movies/${encodeURIComponent(a.movieId)}`}
                      className="text-amber hover:underline"
                    >
                      {a.title}
                    </Link>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {a.percent}% · {relativeDate(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone?: "amber";
  href?: string;
}) {
  const body = (
    <div className="panel p-4">
      <p className="text-[11px] uppercase tracking-widest text-muted">{label}</p>
      <p className={cx("mt-1 font-display text-3xl", tone === "amber" ? "text-amber" : "text-chalk")}>
        {value}
      </p>
    </div>
  );
  return href ? <Link to={href}>{body}</Link> : body;
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("panel p-5", className)}>
      <h2 className="mb-3 font-display text-xl tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-500/40 py-1.5 last:border-0">
      <span className="text-[11px] uppercase tracking-widest text-muted">{label}</span>
      <span className={cx("min-w-0 truncate text-sm", mono && "font-mono text-xs")} title={value}>
        {value}
      </span>
    </div>
  );
}

/** Pins a stubborn title to a specific TMDB id, then rescans. */
function MatchFixer({ id, onDone }: { id: string; onDone: () => Promise<unknown> }) {
  const push = useToasts((s) => s.push);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <span className="flex shrink-0 gap-1.5">
      <input
        className="field !w-28 !py-1 text-xs"
        placeholder="TMDB id"
        value={value}
        inputMode="numeric"
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
      />
      <button
        type="button"
        disabled={!value || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.adminOverride(id, { tmdbId: Number(value) });
            push("Matched and rescanned", "success");
            await onDone();
          } catch {
            push("Couldn't apply that id", "error");
          } finally {
            setBusy(false);
          }
        }}
        className="btn-ghost !px-3 !py-1 text-[11px]"
      >
        {busy ? "…" : "Fix"}
      </button>
    </span>
  );
}
