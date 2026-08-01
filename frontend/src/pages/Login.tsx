import { useState } from "react";
import { useSession } from "@/store/session";
import { FilmIcon } from "@/components/Icons";

export function Login() {
  const login = useSession((s) => s.login);
  const error = useSession((s) => s.error);
  const [name, setName] = useState(() => localStorage.getItem("sunflix:lastProfile") ?? "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(name, pin);
      // Only the display name is remembered — never the PIN.
      localStorage.setItem("sunflix:lastProfile", name.trim());
    } catch {
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 10%, rgba(232,163,61,0.16), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(232,163,61,0.10), transparent 50%)",
        }}
      />

      <form
        onSubmit={submit}
        className="panel relative w-full max-w-sm animate-fade-up p-8 shadow-card"
      >
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber/15 text-amber">
            <FilmIcon className="h-6 w-6" />
          </div>
          <h1 className="font-display text-4xl tracking-wider">
            Sun<span className="text-amber">Flix</span>
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
            your private screening room
          </p>
        </div>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted">
            Who's watching?
          </span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="username"
            required
            maxLength={40}
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted">
            Room PIN
          </span>
          <input
            className="field tracking-[0.4em]"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            placeholder="••••"
            autoComplete="current-password"
            required
          />
        </label>

        {error && (
          <p
            className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full !py-3">
          {busy ? "Checking…" : "Enter"}
        </button>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted">
          A new name creates a new profile. Watch history, watchlist and favourites are kept per
          profile.
        </p>
      </form>
    </div>
  );
}
