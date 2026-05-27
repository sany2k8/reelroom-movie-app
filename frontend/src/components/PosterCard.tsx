import { Link } from "react-router-dom";
import { useLibraryToggle } from "@/hooks/useLibraryActions";
import { cx, formatRuntime, timeLeftLabel } from "@/lib/format";
import { BookmarkIcon, HeartIcon, PlayIcon, StarIcon } from "./Icons";
import type { MovieCard } from "@/types";

interface Props {
  movie: MovieCard;
  /** Rails need a fixed width; grids let the column define it. */
  fixedWidth?: boolean;
  index?: number;
}

export function PosterCard({ movie, fixedWidth, index = 0 }: Props) {
  const { inWatchlist, isFavourite, toggle } = useLibraryToggle(movie);
  const percent = movie.progress?.percent ?? 0;
  const remaining = movie.progress
    ? timeLeftLabel(movie.progress.position, movie.progress.duration)
    : null;

  return (
    <Link
      to={`/movies/${encodeURIComponent(movie.id)}`}
      className={cx(
        "group relative block animate-fade-up",
        fixedWidth && "w-[150px] shrink-0 sm:w-[176px]",
      )}
      // Cards land in a soft stagger rather than all at once.
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      aria-label={`${movie.title}${movie.year ? ` (${movie.year})` : ""}`}
    >
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700
                   shadow-card transition-all duration-300 group-hover:-translate-y-1.5
                   group-hover:border-amber/50 group-hover:shadow-glow"
      >
        <img
          src={movie.poster}
          alt=""
          loading={index < 6 ? "eager" : "lazy"}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <div
          className="absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-transparent
                     opacity-70 transition-opacity duration-300 group-hover:opacity-95"
        />

        {movie.rating != null && (
          <span
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-lg bg-ink/80
                       px-1.5 py-0.5 text-[11px] font-bold text-amber backdrop-blur-sm"
          >
            <StarIcon className="h-3 w-3" />
            {movie.rating.toFixed(1)}
          </span>
        )}

        {movie.quality && (
          <span
            className="absolute right-2 top-2 rounded-lg bg-amber/90 px-1.5 py-0.5 text-[10px]
                       font-bold uppercase tracking-wide text-ink"
          >
            {movie.quality}
          </span>
        )}

        {/* Hover affordances — hidden from touch devices, which have no hover. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center
                     justify-center gap-2 p-3 opacity-0 transition-all duration-300
                     group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100"
        >
          <span className="btn-primary !px-4 !py-2 text-xs">
            <PlayIcon className="h-3.5 w-3.5" />
            Play
          </span>
          <button
            type="button"
            onClick={(e) => toggle("watchlist", e)}
            aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
            aria-pressed={inWatchlist}
            className={cx(
              "flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition-colors",
              inWatchlist
                ? "border-amber bg-amber text-ink"
                : "border-chalk/30 bg-ink/70 text-chalk hover:border-amber hover:text-amber",
            )}
          >
            <BookmarkIcon className="h-4 w-4" filled={inWatchlist} />
          </button>
          <button
            type="button"
            onClick={(e) => toggle("favourite", e)}
            aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={isFavourite}
            className={cx(
              "flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition-colors",
              isFavourite
                ? "border-amber bg-amber text-ink"
                : "border-chalk/30 bg-ink/70 text-chalk hover:border-amber hover:text-amber",
            )}
          >
            <HeartIcon className="h-4 w-4" filled={isFavourite} />
          </button>
        </div>

        {percent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-ink/80">
            <div className="h-full bg-amber" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2.5 px-0.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          {movie.year && <span>{movie.year}</span>}
          {movie.category && (
            <>
              <span className="text-ink-500">•</span>
              <span className="truncate">{movie.category}</span>
            </>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold text-chalk transition-colors group-hover:text-amber">
          {movie.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {remaining ?? formatRuntime(movie.runtimeMinutes) ?? movie.genres.slice(0, 2).join(", ")}
        </p>
      </div>
    </Link>
  );
}

export function PosterSkeleton({ fixedWidth }: { fixedWidth?: boolean }) {
  return (
    <div className={cx("animate-fade-in", fixedWidth && "w-[150px] shrink-0 sm:w-[176px]")}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-700">
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-ink-600/70 to-transparent" />
      </div>
      <div className="mt-2.5 h-3 w-1/2 rounded bg-ink-700" />
      <div className="mt-2 h-3.5 w-4/5 rounded bg-ink-700" />
    </div>
  );
}
