import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Navbar } from "./Navbar";
import { Toaster } from "./Toaster";

export function Layout() {
  const { pathname, search } = useLocation();

  // React Router keeps the scroll position across routes by default, which
  // lands you halfway down a fresh page.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, search]);

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                   focus:rounded-lg focus:bg-amber focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>

      <Navbar />

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-ink-500/60 px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl tracking-wider">
              SUN<span className="text-amber">FLIX</span>
            </span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
              your private screening room
            </span>
          </div>
          <p className="text-xs text-muted">
            Metadata by TMDB. Streams served from your own machine — nothing leaves the box.
          </p>
        </div>
        <div className="sprocket mx-auto mt-6 h-3 max-w-[1600px] opacity-40" />
      </footer>

      <Toaster />
    </div>
  );
}
