import { useCallback, useState } from "react";
import { api } from "@/api";
import { useToasts } from "@/store/toast";
import type { ListName, MovieCard } from "@/types";

/**
 * Optimistic watchlist/favourite toggles. The server is the source of truth,
 * but waiting for a round trip to fill a heart feels broken.
 */
export function useLibraryToggle(movie: Pick<MovieCard, "id" | "title" | "inWatchlist" | "isFavourite">) {
  const push = useToasts((s) => s.push);
  const [inWatchlist, setInWatchlist] = useState(Boolean(movie.inWatchlist));
  const [isFavourite, setIsFavourite] = useState(Boolean(movie.isFavourite));

  const toggle = useCallback(
    async (list: ListName, event?: React.MouseEvent) => {
      event?.preventDefault();
      event?.stopPropagation();

      const current = list === "watchlist" ? inWatchlist : isFavourite;
      const next = !current;
      const setter = list === "watchlist" ? setInWatchlist : setIsFavourite;

      setter(next);
      try {
        await api.toggleList(list, movie.id, next);
        push(
          list === "watchlist"
            ? next
              ? `Added “${movie.title}” to your watchlist`
              : `Removed “${movie.title}” from your watchlist`
            : next
              ? `Favourited “${movie.title}”`
              : `Unfavourited “${movie.title}”`,
          "success",
        );
      } catch {
        setter(current);
        push("Couldn't save that — try again", "error");
      }
    },
    [inWatchlist, isFavourite, movie.id, movie.title, push],
  );

  return { inWatchlist, isFavourite, toggle };
}
