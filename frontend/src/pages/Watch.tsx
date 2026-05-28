import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { PosterCard } from "@/components/PosterCard";
import { ChevronLeftIcon, DownloadIcon, PlayIcon } from "@/components/Icons";
import { formatRuntime } from "@/lib/format";
import type { Movie } from "@/types";

export function Watch() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextUp, setNextUp] = useState<Movie["related"][number] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMovie(null);
    setNextUp(null);
    api
      .movie(id)
      .then((data) => !cancelled && setMovie(data))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 pt-[70px]">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="section-title mb-2">Can't play that</h1>
          <p className="mb-5 text-sm text-muted">{error}</p>
          <Link to="/movies" className="btn-ghost">
            Back to browse
          </Link>
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 pt-24 sm:px-8">
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-ink-700/60" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-12 pt-20 sm:px-8 sm:pt-24">
      <Link
        to={`/movies/${encodeURIComponent(movie.id)}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-amber"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to details
      </Link>

      <VideoPlayer
        movie={movie}
        onEnded={() => setNextUp(movie.related[0] ?? null)}
      />

      {nextUp && (
        <div className="panel mt-4 flex flex-wrap items-center gap-4 p-4">
          <img src={nextUp.poster} alt="" className="h-20 w-14 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest text-amber">Up next</p>
            <p className="truncate font-semibold">{nextUp.title}</p>
            <p className="text-xs text-muted">
              {[nextUp.year, formatRuntime(nextUp.runtimeMinutes)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/watch/${encodeURIComponent(nextUp.id)}`)}
            className="btn-primary"
          >
            <PlayIcon className="h-4 w-4" /> Play
          </button>
          <button type="button" onClick={() => setNextUp(null)} className="btn-ghost">
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
            {movie.title}
            {movie.year && <span className="ml-3 text-muted">{movie.year}</span>}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {movie.quality && <span className="chip !text-amber">{movie.quality}</span>}
            {formatRuntime(movie.runtimeMinutes) && (
              <span className="chip">{formatRuntime(movie.runtimeMinutes)}</span>
            )}
            {movie.genres.slice(0, 3).map((g) => (
              <span key={g} className="chip">
                {g}
              </span>
            ))}
          </div>
        </div>

        <a href={movie.downloadUrl} download className="btn-ghost">
          <DownloadIcon className="h-4 w-4" /> Download
        </a>
      </div>

      {movie.description && (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-chalk/75">{movie.description}</p>
      )}

      <ShortcutLegend />

      {movie.related.length > 0 && (
        <section className="mt-10">
          <h2 className="section-title mb-4">More like this</h2>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {movie.related.slice(0, 6).map((related, i) => (
              <PosterCard key={related.id} movie={related} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Space / K", "Play or pause"],
  ["← / →", "Seek 10s"],
  ["↑ / ↓", "Volume"],
  ["F", "Fullscreen"],
  ["M", "Mute"],
  ["C", "Captions"],
  ["P", "Picture-in-picture"],
  ["0–9", "Jump to %"],
];

function ShortcutLegend() {
  return (
    <details className="mt-6 rounded-xl border border-ink-500/60 bg-ink-700/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-chalk/80 transition-colors hover:text-amber">
        Keyboard shortcuts
      </summary>
      <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map(([key, action]) => (
          <div key={key} className="flex items-center justify-between gap-3 text-xs">
            <dt>
              <kbd className="rounded border border-ink-500 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px]">
                {key}
              </kbd>
            </dt>
            <dd className="text-muted">{action}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
