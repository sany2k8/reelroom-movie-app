import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api";
import { PosterCard, PosterSkeleton } from "@/components/PosterCard";
import { BookmarkIcon, HeartIcon } from "@/components/Icons";
import type { ListName, MovieCard } from "@/types";

const COPY: Record<ListName, { title: string; empty: string; icon: typeof HeartIcon }> = {
  watchlist: {
    title: "Watchlist",
    empty: "Nothing saved yet. Hit the bookmark on any poster to line it up for later.",
    icon: BookmarkIcon,
  },
  favourite: {
    title: "Favourites",
    empty: "No favourites yet. Tap the heart on a film you'd watch again.",
    icon: HeartIcon,
  },
};

export function ListPage({ list }: { list: ListName }) {
  const [items, setItems] = useState<MovieCard[] | null>(null);
  const copy = COPY[list];
  const Icon = copy.icon;

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    api
      .list(list)
      .then((res) => !cancelled && setItems(res.items))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [list]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-24 sm:px-8 sm:pt-28">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">{copy.title}</h1>
        <p className="mt-1 text-xs text-muted">
          {items === null ? "Loading…" : `${items.length} title${items.length === 1 ? "" : "s"}`}
        </p>
      </header>

      {items === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <PosterSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="panel p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber/15 text-amber">
            <Icon className="h-6 w-6" />
          </div>
          <p className="mb-5 text-sm text-muted">{copy.empty}</p>
          <Link to="/movies" className="btn-ghost">
            Browse the library
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((movie, i) => (
            <PosterCard key={movie.id} movie={movie} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
