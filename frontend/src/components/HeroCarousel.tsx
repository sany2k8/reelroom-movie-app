import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLibraryToggle } from "@/hooks/useLibraryActions";
import { cx, formatRuntime, timeLeftLabel } from "@/lib/format";
import {
  BookmarkIcon,
  ChevronLeftIcon,
  HeartIcon,
  PlayIcon,
  StarIcon,
} from "./Icons";
import type { Movie } from "@/types";

const ROTATE_MS = 9000;

export function HeroCarousel({ movies }: { movies: Movie[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number>();

  const go = useCallback(
    (next: number) => setIndex(((next % movies.length) + movies.length) % movies.length),
    [movies.length],
  );

  useEffect(() => {
    if (paused || movies.length < 2) return;
    timer.current = window.setTimeout(() => go(index + 1), ROTATE_MS);
    return () => window.clearTimeout(timer.current);
  }, [index, paused, movies.length, go]);

  // Respect the OS setting rather than auto-rotating regardless.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (query.matches) setPaused(true);
  }, []);

  if (movies.length === 0) return null;
  const movie = movies[index]!;

  return (
    <section
      className="relative h-[62vh] min-h-[420px] w-full overflow-hidden sm:h-[68vh]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured films"
    >
      {movies.map((m, i) => (
        <div
          key={m.id}
          aria-hidden={i !== index}
          className={cx(
            "absolute inset-0 transition-opacity duration-700",
            i === index ? "opacity-100" : "opacity-0",
          )}
        >
          <img
            src={m.backdrop ?? m.poster}
            alt=""
            className={cx(
              "h-full w-full object-cover object-center",
              // Without a TMDB backdrop the only art is a 2:3 poster; blowing it
              // up sharp looks broken, so it becomes a blurred colour wash.
              !m.backdrop && "scale-110 blur-2xl",
              i === index && !paused && "animate-ken-burns",
            )}
            loading={i === 0 ? "eager" : "lazy"}
          />
        </div>
      ))}

      {/* Two gradients: one for text legibility, one to melt into the page. */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/30" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-ink via-ink/80 to-transparent" />

      <HeroContent key={movie.id} movie={movie} />

      {movies.length > 1 && (
        <>
          <ArrowButton side="left" onClick={() => go(index - 1)} />
          <ArrowButton side="right" onClick={() => go(index + 1)} />

          <div className="absolute bottom-6 right-4 z-20 flex gap-2 sm:right-8">
            {movies.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show ${m.title}`}
                aria-current={i === index}
                className={cx(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-8 bg-amber" : "w-3 bg-chalk/30 hover:bg-chalk/60",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function HeroContent({ movie }: { movie: Movie }) {
  const navigate = useNavigate();
  const { inWatchlist, isFavourite, toggle } = useLibraryToggle(movie);
  const resume = movie.progress ? timeLeftLabel(movie.progress.position, movie.progress.duration) : null;

  return (
    <div className="relative z-10 flex h-full items-center">
      <div className="flex animate-fade-up items-center gap-10 px-4 sm:px-8 lg:px-14">
        <Link
          to={`/movies/${encodeURIComponent(movie.id)}`}
          className="hidden shrink-0 lg:block"
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={movie.poster}
            alt=""
            className="w-52 rounded-2xl border border-ink-500/60 shadow-card transition-transform duration-300 hover:scale-[1.03]"
          />
        </Link>

        <div className="flex max-w-2xl flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {movie.rating != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber/15 px-2.5 py-1 font-bold text-amber">
                <StarIcon className="h-3.5 w-3.5" />
                {movie.rating.toFixed(1)}
              </span>
            )}
            {movie.certification && <span className="chip">{movie.certification}</span>}
            {movie.quality && <span className="chip !text-amber">{movie.quality}</span>}
            {movie.runtimeMinutes && <span className="chip">{formatRuntime(movie.runtimeMinutes)}</span>}
          </div>

          <h1 className="font-display text-5xl leading-none tracking-wide sm:text-6xl lg:text-7xl">
            {movie.title}
            {movie.year && <span className="ml-3 text-muted">{movie.year}</span>}
          </h1>

          {movie.tagline && (
            <p className="-mt-1 text-sm italic text-amber/80">{movie.tagline}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {movie.genres.slice(0, 4).map((genre, i) => (
              <span key={genre} className="flex items-center gap-2">
                {i > 0 && <span className="text-ink-500">|</span>}
                <Link
                  to={`/movies?genre=${encodeURIComponent(genre)}`}
                  className="transition-colors hover:text-amber"
                >
                  {genre}
                </Link>
              </span>
            ))}
          </div>

          {movie.description && (
            <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-chalk/75 sm:text-base">
              {movie.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/watch/${encodeURIComponent(movie.id)}`)}
              className="btn-primary !px-7 !py-3"
            >
              <PlayIcon className="h-4 w-4" />
              {resume ? "Resume" : "Play now"}
            </button>

            <Link to={`/movies/${encodeURIComponent(movie.id)}`} className="btn-ghost !py-3">
              More info
            </Link>

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

          {resume && <p className="text-xs text-muted">{resume} — picks up where you stopped</p>}
        </div>
      </div>
    </div>
  );
}

function ArrowButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous film" : "Next film"}
      className={cx(
        "absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center",
        "rounded-full border border-chalk/20 bg-ink/60 text-chalk backdrop-blur-sm",
        "transition-all hover:border-amber hover:text-amber sm:flex",
        side === "left" ? "left-4" : "right-4 rotate-180",
      )}
    >
      <ChevronLeftIcon className="h-5 w-5" />
    </button>
  );
}
