import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useSession } from "@/store/session";
import { cx } from "@/lib/format";
import { BookmarkIcon, HeartIcon, LogoutIcon, SearchIcon } from "./Icons";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/movies", label: "Movies", end: false },
  { to: "/watchlist", label: "Watchlist", end: false },
  { to: "/favourites", label: "Favourites", end: false },
];

export function Navbar() {
  const navigate = useNavigate();
  const profile = useSession((s) => s.profile);
  const logout = useSession((s) => s.logout);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Transparent over the hero, solid once the page moves — the standard
  // streaming-app chrome behaviour.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typingElsewhere =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(e.target.tagName);

      if (e.key === "/" && !typingElsewhere) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") searchRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/movies?q=${encodeURIComponent(trimmed)}` : "/movies");
    setMenuOpen(false);
  };

  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        scrolled
          ? "border-b border-ink-500/60 bg-ink/90 backdrop-blur-xl"
          : "bg-gradient-to-b from-ink/90 to-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:h-[70px] sm:gap-6 sm:px-8">
        <Link to="/" className="flex shrink-0 items-baseline gap-2" aria-label="Reelroom home">
          <span className="font-display text-2xl tracking-wider sm:text-[28px]">
            REEL<span className="text-amber">ROOM</span>
          </span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cx(
                    "rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                    isActive ? "text-amber" : "text-chalk/70 hover:text-chalk",
                  )
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <form onSubmit={submitSearch} className="ml-auto flex-1 sm:max-w-xs" role="search">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search films…  /"
              aria-label="Search films"
              className="field !rounded-full !py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </form>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="Account menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber/50
                     bg-amber/15 text-sm font-bold uppercase text-amber transition-colors hover:bg-amber/25"
        >
          {profile?.name?.[0] ?? "?"}
        </button>
      </nav>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-4 top-16 z-20 w-56 animate-fade-up panel p-2 sm:right-8">
            <div className="border-b border-ink-500/60 px-3 py-2">
              <p className="text-xs uppercase tracking-widest text-muted">Signed in as</p>
              <p className="truncate font-semibold text-chalk">{profile?.name}</p>
            </div>

            <div className="md:hidden">
              {LINKS.map((link) => (
                <MenuLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)}>
                  {link.label}
                </MenuLink>
              ))}
            </div>

            <div className="hidden md:block">
              <MenuLink to="/watchlist" onClick={() => setMenuOpen(false)}>
                <BookmarkIcon className="h-4 w-4" /> Watchlist
              </MenuLink>
              <MenuLink to="/favourites" onClick={() => setMenuOpen(false)}>
                <HeartIcon className="h-4 w-4" /> Favourites
              </MenuLink>
            </div>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void logout();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm
                         text-chalk/80 transition-colors hover:bg-ink-600 hover:text-amber"
            >
              <LogoutIcon className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </header>
  );
}

function MenuLink({
  to,
  children,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-chalk/80
                 transition-colors hover:bg-ink-600 hover:text-amber"
    >
      {children}
    </Link>
  );
}
