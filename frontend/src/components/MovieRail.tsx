import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PosterCard, PosterSkeleton } from "./PosterCard";
import { ChevronLeftIcon } from "./Icons";
import { cx } from "@/lib/format";
import type { MovieCard } from "@/types";

interface Props {
  title: string;
  items: MovieCard[];
  href?: string;
  loading?: boolean;
}

export function MovieRail({ title, items, href, loading }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    sync();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync, items.length]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    // Nudge by just under a viewport so a partial card stays visible as an anchor.
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  if (!loading && items.length === 0) return null;

  return (
    <section className="group/rail relative">
      <div className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-8">
        <h2 className="section-title">{title}</h2>
        {href && (
          <Link
            to={href}
            className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted
                       transition-colors hover:text-amber"
          >
            See all →
          </Link>
        )}
      </div>

      <div className="relative">
        <RailButton side="left" onClick={() => scrollBy(-1)} hidden={atStart} />
        <RailButton side="right" onClick={() => scrollBy(1)} hidden={atEnd} />

        <div
          ref={scroller}
          onScroll={sync}
          className="no-scrollbar flex gap-3.5 overflow-x-auto scroll-smooth px-4 pb-2 sm:gap-4 sm:px-8"
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <PosterSkeleton key={i} fixedWidth />)
            : items.map((movie, i) => (
                <PosterCard key={movie.id} movie={movie} index={i} fixedWidth />
              ))}
        </div>
      </div>
    </section>
  );
}

function RailButton({
  side,
  onClick,
  hidden,
}: {
  side: "left" | "right";
  onClick: () => void;
  hidden: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      tabIndex={hidden ? -1 : 0}
      className={cx(
        "absolute top-0 z-10 hidden h-[calc(100%-2.5rem)] w-14 items-center justify-center",
        "bg-gradient-to-r from-ink via-ink/80 to-transparent text-chalk opacity-0 transition-opacity",
        "duration-200 hover:text-amber focus-visible:opacity-100 group-hover/rail:opacity-100 lg:flex",
        side === "left" ? "left-0" : "right-0 rotate-180",
        hidden && "!opacity-0 pointer-events-none",
      )}
    >
      {/* The right-hand button is the same glyph, rotated with its container. */}
      <ChevronLeftIcon className="h-7 w-7" />
    </button>
  );
}
