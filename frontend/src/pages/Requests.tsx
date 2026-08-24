import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/api";
import { useSession } from "@/store/session";
import { useToasts } from "@/store/toast";
import { cx, relativeDate } from "@/lib/format";
import { CloseIcon, PlayIcon } from "@/components/Icons";
import type { MovieRequest } from "@/types";

const FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "fulfilled", label: "Added" },
  { value: "declined", label: "Declined" },
] as const;

export function Requests() {
  const profile = useSession((s) => s.profile);
  const push = useToasts((s) => s.push);
  const [items, setItems] = useState<MovieRequest[] | null>(null);
  const [filter, setFilter] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = (status: string) =>
    api
      .requests(status || undefined)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));

  useEffect(() => {
    setItems(null);
    void load(filter);
  }, [filter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.createRequest({
        title: title.trim(),
        year: year ? Number(year) : null,
        note: note.trim() || undefined,
      });
      setTitle("");
      setYear("");
      setNote("");
      push("Request added — it'll close itself when the film shows up", "success");
      await load(filter);
    } catch (err) {
      push(
        err instanceof ApiError && err.code === "DUPLICATE_REQUEST"
          ? "You've already asked for that one"
          : "Couldn't add that request",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const vote = async (request: MovieRequest) => {
    const next = !request.hasVoted;
    setItems((prev) =>
      prev?.map((r) =>
        r.id === request.id
          ? { ...r, hasVoted: next, votes: r.votes + (next ? 1 : -1) }
          : r,
      ) ?? null,
    );
    await api.voteRequest(request.id, next).catch(() => void load(filter));
  };

  const withdraw = async (request: MovieRequest) => {
    setItems((prev) => prev?.filter((r) => r.id !== request.id) ?? null);
    await api.deleteRequest(request.id).catch(() => void load(filter));
    push("Request withdrawn");
  };

  const setStatus = async (request: MovieRequest, status: "fulfilled" | "declined" | "open") => {
    await api.setRequestStatus(request.id, status);
    push(`Marked “${request.title}” as ${status}`, "success");
    await load(filter);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-8 sm:pt-28">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">Requests</h1>
        <p className="mt-1 text-sm text-muted">
          Ask for something that isn't in the library. When a matching file lands, the request closes
          itself.
        </p>
      </header>

      <form onSubmit={submit} className="panel mb-8 flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="field flex-1"
            placeholder="Film title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
          <input
            className="field sm:w-28"
            placeholder="Year"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <input
          className="field"
          placeholder="Anything else? (language, why, a link…)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={400}
        />
        <button type="submit" disabled={busy || !title.trim()} className="btn-primary self-start">
          {busy ? "Adding…" : "Request it"}
        </button>
      </form>

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cx(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              filter === f.value
                ? "border-amber bg-amber text-ink"
                : "border-ink-500 bg-ink-800 text-muted hover:text-chalk",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="panel p-12 text-center">
          <p className="section-title mb-2">Nothing here yet</p>
          <p className="text-sm text-muted">Be the first to ask for something.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((request) => (
            <li
              key={request.id}
              className="panel flex animate-fade-up items-start gap-4 p-4"
            >
              <button
                type="button"
                onClick={() => void vote(request)}
                aria-label={request.hasVoted ? "Remove your vote" : "Vote for this"}
                aria-pressed={request.hasVoted}
                disabled={request.status !== "open"}
                className={cx(
                  "flex w-12 shrink-0 flex-col items-center rounded-xl border py-1.5 transition-colors",
                  request.hasVoted
                    ? "border-amber bg-amber/15 text-amber"
                    : "border-ink-500 text-muted hover:border-amber/60 hover:text-amber",
                  request.status !== "open" && "opacity-40",
                )}
              >
                <span className="text-xs leading-none">▲</span>
                <span className="text-sm font-bold leading-tight">{request.votes}</span>
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">
                    {request.title}
                    {request.year && <span className="ml-2 text-muted">{request.year}</span>}
                  </h2>
                  <StatusChip status={request.status} />
                </div>
                {request.note && <p className="mt-1 text-sm text-chalk/70">{request.note}</p>}
                <p className="mt-1.5 text-[11px] text-muted">
                  asked by {request.requester ?? "someone"} · {relativeDate(request.createdAt)}
                </p>

                {request.movieId && (
                  <Link
                    to={`/watch/${encodeURIComponent(request.movieId)}`}
                    className="btn-primary mt-3 !px-4 !py-1.5 text-xs"
                  >
                    <PlayIcon className="h-3.5 w-3.5" /> Watch it
                  </Link>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {profile?.isAdmin && request.status === "open" && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void setStatus(request, "fulfilled")}
                      className="btn-ghost !px-3 !py-1 text-[11px]"
                    >
                      Added
                    </button>
                    <button
                      type="button"
                      onClick={() => void setStatus(request, "declined")}
                      className="btn-ghost !px-3 !py-1 text-[11px]"
                    >
                      Decline
                    </button>
                  </div>
                )}
                {(request.profileId === profile?.id || profile?.isAdmin) && (
                  <button
                    type="button"
                    onClick={() => void withdraw(request)}
                    aria-label="Withdraw request"
                    className="text-muted transition-colors hover:text-red-400"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: MovieRequest["status"] }) {
  const tone =
    status === "fulfilled"
      ? "border-amber/60 text-amber"
      : status === "declined"
        ? "border-red-500/50 text-red-300"
        : "border-ink-500 text-muted";
  const label = status === "fulfilled" ? "in the library" : status;
  return <span className={cx("chip !text-[10px]", tone)}>{label}</span>;
}
