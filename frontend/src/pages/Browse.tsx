import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api";
import { FilterSidebar, type FilterValues } from "@/components/FilterSidebar";
import { PosterCard, PosterSkeleton } from "@/components/PosterCard";
import { FilterIcon, GridIcon, ListIcon, StarIcon } from "@/components/Icons";
import { cx, formatRuntime } from "@/lib/format";
import type { Facets, MovieCard } from "@/types";

const PAGE_SIZE = 24;

const SORTS = [
  { value: "added", label: "Recently added" },
  { value: "title", label: "Title" },
  { value: "year", label: "Year" },
  { value: "rating", label: "Rating" },
  { value: "runtime", label: "Runtime" },
  { value: "random", label: "Surprise me" },
] as const;

/** URL is the single source of truth for filters, so links are shareable. */
function readFilters(params: URLSearchParams): FilterValues {
  return {
    q: params.get("q") ?? "",
    category: params.get("category") ?? "",
    genre: params.get("genre") ?? "",
    year: params.get("year") ?? "",
    quality: params.get("quality") ?? "",
    letter: params.get("letter") ?? "",
    ratingMin: Number(params.get("ratingMin") ?? 0),
    ratingMax: Number(params.get("ratingMax") ?? 10),
  };
}

function countActive(f: FilterValues) {
  let count = 0;
  if (f.q) count += 1;
  if (f.category) count += 1;
  if (f.genre) count += 1;
  if (f.year) count += 1;
  if (f.quality) count += 1;
  if (f.letter) count += 1;
  if (f.ratingMin > 0 || f.ratingMax < 10) count += 1;
  return count;
}

export function Browse() {
  const [params, setParams] = useSearchParams();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [items, setItems] = useState<MovieCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<"grid" | "list">(
    () => (localStorage.getItem("sunflix:view") as "grid" | "list") ?? "grid",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = useMemo(() => readFilters(params), [params]);
  const sort = params.get("sort") ?? "added";
  const order = params.get("order") ?? "desc";
  const activeCount = countActive(filters);

  useEffect(() => {
    api.facets().then(setFacets).catch(() => undefined);
  }, []);

  useEffect(() => {
    localStorage.setItem("sunflix:view", view);
  }, [view]);

  const query = useMemo(
    () => ({
      q: filters.q || undefined,
      category: filters.category || undefined,
      genre: filters.genre || undefined,
      year: filters.year || undefined,
      quality: filters.quality || undefined,
      letter: filters.letter || undefined,
      ratingMin: filters.ratingMin > 0 ? filters.ratingMin : undefined,
      ratingMax: filters.ratingMax < 10 ? filters.ratingMax : undefined,
      sort,
      order,
      limit: PAGE_SIZE,
    }),
    [filters, sort, order],
  );

  // Any filter change resets to page 1 and replaces the list.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .movies({ ...query, page: 1 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setHasMore(res.hasMore);
        setPage(1);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    api
      .movies({ ...query, page: next })
      .then((res) => {
        setItems((prev) => [...prev, ...res.items]);
        setHasMore(res.hasMore);
        setPage(next);
      })
      .finally(() => setLoadingMore(false));
  }, [hasMore, loadingMore, page, query]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const patch = (next: Partial<FilterValues>) => {
    const merged = { ...filters, ...next };
    const search = new URLSearchParams();
    if (merged.q) search.set("q", merged.q);
    if (merged.category) search.set("category", merged.category);
    if (merged.genre) search.set("genre", merged.genre);
    if (merged.year) search.set("year", merged.year);
    if (merged.quality) search.set("quality", merged.quality);
    if (merged.letter) search.set("letter", merged.letter);
    if (merged.ratingMin > 0) search.set("ratingMin", String(merged.ratingMin));
    if (merged.ratingMax < 10) search.set("ratingMax", String(merged.ratingMax));
    if (sort !== "added") search.set("sort", sort);
    if (order !== "desc") search.set("order", order);
    setParams(search, { replace: true });
  };

  const reset = () => setParams(new URLSearchParams(), { replace: true });

  const sidebar = (
    <FilterSidebar
      facets={facets}
      values={filters}
      onChange={patch}
      onReset={reset}
      activeCount={activeCount}
    />
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-24 sm:px-8 sm:pt-28">
      <div className="flex gap-8">
        <div className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24">{sidebar}</div>
        </div>

        <div className="min-w-0 flex-1">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
                {filters.q ? `“${filters.q}”` : "Movies"}
              </h1>
              <p className="mt-1 text-xs text-muted">
                {loading ? "Searching…" : `${total} title${total === 1 ? "" : "s"}`}
                {activeCount > 0 && !loading && " matching your filters"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className="btn-ghost !px-4 !py-2 text-xs lg:hidden"
                aria-expanded={filtersOpen}
              >
                <FilterIcon className="h-4 w-4" />
                Filters{activeCount > 0 && ` (${activeCount})`}
              </button>

              <select
                value={`${sort}:${order}`}
                onChange={(e) => {
                  const [nextSort, nextOrder] = e.target.value.split(":");
                  const search = new URLSearchParams(params);
                  if (nextSort && nextSort !== "added") search.set("sort", nextSort);
                  else search.delete("sort");
                  if (nextOrder && nextOrder !== "desc") search.set("order", nextOrder);
                  else search.delete("order");
                  setParams(search, { replace: true });
                }}
                aria-label="Sort by"
                className="field !w-auto !py-2 text-xs"
              >
                {SORTS.map((option) => (
                  <optgroup key={option.value} label={option.label}>
                    <option value={`${option.value}:desc`}>{option.label} ↓</option>
                    <option value={`${option.value}:asc`}>{option.label} ↑</option>
                  </optgroup>
                ))}
              </select>

              <div className="flex overflow-hidden rounded-lg border border-ink-500">
                <ViewButton active={view === "grid"} onClick={() => setView("grid")} label="Grid view">
                  <GridIcon className="h-4 w-4" />
                </ViewButton>
                <ViewButton active={view === "list"} onClick={() => setView("list")} label="List view">
                  <ListIcon className="h-4 w-4" />
                </ViewButton>
              </div>
            </div>
          </header>

          {filtersOpen && (
            <div className="panel mb-6 p-5 lg:hidden">{sidebar}</div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <PosterSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="panel p-12 text-center">
              <p className="section-title mb-2">Nothing matches</p>
              <p className="text-sm text-muted">
                Try widening the rating range or clearing a filter.
              </p>
              {activeCount > 0 && (
                <button type="button" onClick={reset} className="btn-ghost mt-5">
                  Clear all filters
                </button>
              )}
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((movie, i) => (
                <PosterCard key={movie.id} movie={movie} index={i} />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((movie) => (
                <ListRow key={movie.id} movie={movie} />
              ))}
            </ul>
          )}

          <div ref={sentinel} className="h-10" />
          {loadingMore && <p className="py-4 text-center text-sm text-muted">Loading more…</p>}
        </div>
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        "flex h-9 w-9 items-center justify-center transition-colors",
        active ? "bg-amber text-ink" : "bg-ink-800 text-muted hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}

function ListRow({ movie }: { movie: MovieCard }) {
  return (
    <li>
      <Link
        to={`/movies/${encodeURIComponent(movie.id)}`}
        className="group flex animate-fade-up gap-4 rounded-xl border border-ink-500/60 bg-ink-700/40 p-3
                   transition-all hover:border-amber/50 hover:bg-ink-700"
      >
        <img
          src={movie.poster}
          alt=""
          loading="lazy"
          className="h-24 w-16 shrink-0 rounded-lg object-cover sm:h-28 sm:w-[75px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="truncate font-semibold transition-colors group-hover:text-amber">
              {movie.title}
              {movie.year && <span className="ml-2 font-normal text-muted">{movie.year}</span>}
            </h3>
            {movie.rating != null && (
              <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-amber">
                <StarIcon className="h-3.5 w-3.5" />
                {movie.rating.toFixed(1)}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {movie.quality && <span className="chip !text-amber">{movie.quality}</span>}
            {movie.category && <span className="chip">{movie.category}</span>}
            {formatRuntime(movie.runtimeMinutes) && (
              <span className="chip">{formatRuntime(movie.runtimeMinutes)}</span>
            )}
          </div>
          <p className="mt-2 truncate text-xs text-muted">{movie.genres.join(" · ")}</p>
          {movie.progress && movie.progress.percent > 0 && (
            <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-ink-600">
              <div className="h-full bg-amber" style={{ width: `${movie.progress.percent}%` }} />
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
