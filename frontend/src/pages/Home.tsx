import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import { HeroCarousel } from "@/components/HeroCarousel";
import { MovieRail } from "@/components/MovieRail";
import { FilmIcon } from "@/components/Icons";
import type { HomePayload } from "@/types";

export function Home() {
  const [data, setData] = useState<HomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .home()
      .then((payload) => !cancelled && setData(payload))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorState message={error} />;

  if (!data) {
    return (
      <div className="pt-[70px]">
        <div className="h-[62vh] min-h-[420px] w-full animate-pulse bg-ink-700/50" />
        <div className="mt-10 flex flex-col gap-12">
          <MovieRail title="Loading…" items={[]} loading />
        </div>
      </div>
    );
  }

  if (data.stats.total === 0) return <EmptyLibrary />;

  return (
    <div className="pb-10">
      <HeroCarousel movies={data.hero} />

      <div className="relative z-10 -mt-10 flex flex-col gap-11 sm:-mt-16">
        {data.rails.map((rail) => (
          <MovieRail key={rail.key} title={rail.title} items={rail.items} href={rail.href} />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 pt-[70px]">
      <div className="panel max-w-md p-8 text-center">
        <h1 className="section-title mb-2">Couldn't load your library</h1>
        <p className="text-sm text-muted">{message}</p>
        <button type="button" onClick={() => window.location.reload()} className="btn-ghost mt-5">
          Try again
        </button>
      </div>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 pt-[70px]">
      <div className="panel max-w-lg p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber/15 text-amber">
          <FilmIcon className="h-7 w-7" />
        </div>
        <h1 className="section-title mb-3">Your screening room is empty</h1>
        <p className="text-sm leading-relaxed text-muted">
          Drop video files into the <code className="text-amber">movies/</code> folder and Reelroom
          will pick them up, read their real duration and resolution, and pull artwork, cast and
          ratings from TMDB automatically.
        </p>
        <Link to="/movies" className="btn-ghost mt-6">
          Go to browse
        </Link>
      </div>
    </div>
  );
}
