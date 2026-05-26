import { create } from "zustand";
import { api, setUnauthenticatedHandler } from "@/api";
import type { Profile } from "@/types";

interface SessionState {
  profile: Profile | null;
  status: "loading" | "authenticated" | "anonymous";
  error: string | null;
  check: () => Promise<void>;
  login: (name: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  profile: null,
  status: "loading",
  error: null,

  check: async () => {
    try {
      const { profile } = await api.session();
      set({ profile, status: profile ? "authenticated" : "anonymous", error: null });
    } catch {
      set({ profile: null, status: "anonymous" });
    }
  },

  login: async (name, pin) => {
    set({ error: null });
    try {
      const { profile } = await api.login(name, pin);
      set({ profile, status: "authenticated" });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Sign-in failed" });
      throw err;
    }
  },

  logout: async () => {
    await api.logout().catch(() => undefined);
    set({ profile: null, status: "anonymous" });
  },
}));

// An expired cookie shows up as a 401 on any request, not just at boot.
setUnauthenticatedHandler(() => {
  if (useSession.getState().status === "authenticated") {
    useSession.setState({ profile: null, status: "anonymous" });
  }
});
