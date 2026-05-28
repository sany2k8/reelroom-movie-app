import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api";
import { MovieRail } from "@/components/MovieRail";
import { useLibraryToggle } from "@/hooks/useLibraryActions";
import { cx, formatBytes, formatRuntime, relativeDate, timeLeftLabel } from "@/lib/format";
import {
  BookmarkIcon,
  CloseIcon,
  DownloadIcon,
  HeartIcon,
  PlayIcon,
  StarIcon,
} from "@/components/Icons";
import type { Movie } from "@/types";

export function Detail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMovie(null);
    setError(null);
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
          <h1 className="section-title mb-2">Not found</h1>
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
      <div className="pt-[70px]">
        <div className="h-[52vh] animate-pulse bg-ink-700/50" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <DetailHero movie={movie} onTrailer={() => setTrailerOpen(true)} onPlay={() => navigate(`/watch/${encodeURIComponent(movie.id)}`)} />

      <div className="mx-auto max-w-[1600px] px-4 sm:px-8">
        {movie.cast.length > 0 && (
          <section className="mt-10">
            <h2 className="section-title mb-4">Cast</h2>
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
              {movie.cast.map((person) => (
                <div key={person.id} className="w-[104px] shrink-0 text-center">
                  <div className="aspect-[2/3] overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700">
                    {person.profile ? (
                      <img
                        src={person.profile}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl text-muted">
                        {person.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold">{person.name}</p>
                  {person.character && (
                    <p className="truncate text-[11px] text-muted">{person.character}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <FileDetails movie={movie} />
      </div>

      {movie.related.length > 0 && (
        <div className="mt-12">
          <MovieRail title="More like this" items={movie.related} />
        </div>
      )}

      {trailerOpen && movie.trailerKey && (
        <TrailerModal trailerKey={movie.trailerKey} onClose={() => setTrailerOpen(false)} />
      )}
    </div>
  );
}

function DetailHero({
  movie,
  onPlay,
  onTrailer,
}: {
  movie: Movie;
  onPlay: () => void;
  onTrailer: () => void;
}) {
  const { inWatchlist, isFavourite, toggle } = useLibraryToggle(movie);
  const resume = movie.progress ? timeLeftLabel(movie.progress.position, movie.progress.duration) : null;

  return (
    <header className="relative">
      <div className="absolute inset-0 h-[62vh] overflow-hidden">
        {movie.backdrop ? (
          <img src={movie.backdrop} alt="" className="h-full w-full object-cover" />
        ) : (
          <img src={movie.poster} alt="" className="h-full w-full object-cover blur-2xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/90 to-ink/40" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-ink to-transparent" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 pt-28 sm:px-8 sm:pt-36">
        <div className="flex flex-col gap-7 sm:flex-row sm:gap-9">
          <img
            src={movie.poster}
            alt={`${movie.title} poster`}
            className="w-40 shrink-0 animate-fade-up self-start rounded-2xl border border-ink-500/60 shadow-card sm:w-56"
          />

          <div className="flex animate-fade-up flex-col gap-4 pt-1">
            <div>
              <h1 className="font-display text-4xl leading-none tracking-wide sm:text-6xl">
                {movie.title}
              </h1>
              {movie.tagline && <p className="mt-2 text-sm italic text-amber/80">{movie.tagline}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {movie.rating != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber/15 px-2.5 py-1 text-sm font-bold text-amber">
                  <StarIcon className="h-4 w-4" />
                  {movie.rating.toFixed(1)}
                  {movie.voteCount ? (
                    <span className="ml-1 text-[11px] font-normal text-muted">
                      ({movie.voteCount.toLocaleString()})
                    </span>
                  ) : null}
                </span>
              )}
              {movie.year && <span className="chip">{movie.year}</span>}
              {movie.certification && <span className="chip">{movie.certification}</span>}
              {formatRuntime(movie.runtimeMinutes) && (
                <span className="chip">{formatRuntime(movie.runtimeMinutes)}</span>
              )}
              {movie.quality && <span className="chip !text-amber">{movie.quality}</span>}
              {movie.category && (
                <Link to={`/movies?category=${encodeURIComponent(movie.category)}`} className="chip hover:!text-amber">
                  {movie.category}
                </Link>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {movie.genres.map((genre) => (
                <Link
                  key={genre}
                  to={`/movies?genre=${encodeURIComponent(genre)}`}
                  className="rounded-full border border-ink-500 px-3 py-1 text-xs text-muted transition-colors hover:border-amber/60 hover:text-amber"
                >
                  {genre}
                </Link>
              ))}
            </div>

            {movie.description && (
              <p className="max-w-3xl text-sm leading-relaxed text-chalk/80">{movie.description}</p>
            )}

            {(movie.directors.length > 0 || movie.writers.length > 0) && (
              <dl className="flex flex-wrap gap-x-8 gap-y-1 text-xs">
                {movie.directors.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="text-muted">Director</dt>
                    <dd className="font-semibold">{movie.directors.join(", ")}</dd>
                  </div>
                )}
                {movie.writers.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="text-muted">Writers</dt>
                    <dd className="font-semibold">{movie.writers.join(", ")}</dd>
                  </div>
                )}
              </dl>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={onPlay} className="btn-primary !px-7 !py-3">
                <PlayIcon className="h-4 w-4" />
                {resume ? `Resume · ${resume}` : "Play"}
              </button>

              {movie.trailerKey && (
                <button type="button" onClick={onTrailer} className="btn-ghost !py-3">
                  Trailer
                </button>
              )}

              <a href={movie.downloadUrl} download className="btn-ghost !py-3">
                <DownloadIcon className="h-4 w-4" />
                Download
              </a>

              <button
                type="button"
                onClick={(e) => toggle("watchlist", e)}
                aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
                aria-pressed={inWatchlist}
                className={cx("btn-icon", inWatchlist && "border-amber bg-amber text-ink")}
              >
                <BookmarkIcon className="h-4 w-4" filled={inWatchlist} />
              </button>

              <button
                type="button"
                onClick={(e) => toggle("favourite", e)}
                aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isFavourite}
                className={cx("btn-icon", isFavourite && "border-amber bg-amber text-ink")}
              >
                <HeartIcon className="h-4 w-4" filled={isFavourite} />
              </button>
            </div>

            {movie.progress && movie.progress.percent > 0 && (
              <div className="mt-1 max-w-sm">
                <div className="h-1 overflow-hidden rounded-full bg-ink-600">
                  <div className="h-full bg-amber" style={{ width: `${movie.progress.percent}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  {Math.round(movie.progress.percent)}% watched
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function FileDetails({ movie }: { movie: Movie }) {
  const rows: [string, string | null][] = [
    ["File", movie.file],
    ["Size", formatBytes(movie.sizeBytes)],
    ["Resolution", movie.width && movie.height ? `${movie.width} × ${movie.height}` : null],
    ["Video codec", movie.videoCodec?.toUpperCase() ?? null],
    [
      "Audio",
      movie.audioTracks.length
        ? movie.audioTracks
            .map((t) => [t.language?.toUpperCase(), t.codec?.toUpperCase(), t.channels && `${t.channels}ch`].filter(Boolean).join(" "))
            .join(", ")
        : null,
    ],
    ["Subtitles", movie.subtitles.length ? movie.subtitles.map((s) => s.label).join(", ") : "None"],
    ["Added", relativeDate(movie.addedAt)],
  ];

  return (
    <section className="mt-10">
      <h2 className="section-title mb-4">File</h2>
      <dl className="grid gap-x-8 gap-y-3 rounded-2xl border border-ink-500/60 bg-ink-700/40 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-widest text-muted">{label}</dt>
              <dd className="truncate text-sm font-medium" title={value ?? undefined}>
                {value}
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

function TrailerModal({ trailerKey, onClose }: { trailerKey: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Trailer"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Close trailer" className="btn-icon">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="aspect-video overflow-hidden rounded-2xl border border-ink-500">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0`}
            title="Trailer"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}
