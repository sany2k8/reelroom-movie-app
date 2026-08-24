import type {
  AdminOverview,
  AdminSession,
  MovieRequest,
  Facets,
  HomePayload,
  ListName,
  Movie,
  MovieCard,
  Paged,
  PlayerPrefs,
  Profile,
  Progress,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Set by the session store so any 401 anywhere bounces to the login screen. */
let onUnauthenticated: (() => void) | null = null;
export const setUnauthenticatedHandler = (fn: () => void) => {
  onUnauthenticated = fn;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });

  if (res.status === 401) {
    onUnauthenticated?.();
    throw new ApiError(401, "Not signed in", "UNAUTHENTICATED");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string; code?: string });
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
};

export const api = {
  session: () => request<{ profile: Profile | null; profiles: Profile[] }>("/auth/session"),

  login: (name: string, pin: string) =>
    request<{ profile: Profile }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ name, pin }),
    }),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  home: () => request<HomePayload>("/movies/home"),

  facets: () => request<Facets>("/movies/facets"),

  movies: (params: Record<string, string | number | undefined | null>) =>
    request<Paged<MovieCard>>(`/movies${qs(params)}`),

  movie: (id: string) => request<Movie>(`/movies/${encodeURIComponent(id)}`),

  rescan: (force = false) =>
    request<{ lastScan: string | null; scanning: boolean; count: number }>(
      `/movies/rescan${force ? "?force=true" : ""}`,
      { method: "POST" },
    ),

  saveProgress: (movieId: string, position: number, duration: number) =>
    request<Progress>(`/library/progress/${encodeURIComponent(movieId)}`, {
      method: "PUT",
      body: JSON.stringify({ position, duration }),
    }),

  clearProgress: (movieId: string) =>
    request<{ removed: boolean }>(`/library/progress/${encodeURIComponent(movieId)}`, {
      method: "DELETE",
    }),

  list: (list: ListName) => request<{ items: MovieCard[]; total: number }>(`/library/lists/${list}`),

  toggleList: (list: ListName, movieId: string, active: boolean) =>
    request<{ active: boolean }>(`/library/lists/${list}/${encodeURIComponent(movieId)}`, {
      method: "PUT",
      body: JSON.stringify({ active }),
    }),

  prefs: () => request<PlayerPrefs>("/library/prefs"),

  requests: (status?: string) =>
    request<{ items: MovieRequest[] }>(`/requests${status ? `?status=${status}` : ""}`),

  createRequest: (body: { title: string; year?: number | null; note?: string }) =>
    request<MovieRequest>("/requests", { method: "POST", body: JSON.stringify(body) }),

  voteRequest: (id: number, active: boolean) =>
    request<{ active: boolean }>(`/requests/${id}/vote`, {
      method: "PUT",
      body: JSON.stringify({ active }),
    }),

  deleteRequest: (id: number) =>
    request<{ removed: boolean }>(`/requests/${id}`, { method: "DELETE" }),

  setRequestStatus: (id: number, status: string, movieId?: string | null) =>
    request<MovieRequest>(`/requests/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, movieId }),
    }),

  adminOverview: () => request<AdminOverview>("/admin/overview"),

  adminRescan: (force = false) =>
    request<{ count: number }>(`/admin/rescan${force ? "?force=true" : ""}`, { method: "POST" }),

  adminCheckNow: () => request<{ count: number }>("/admin/check-now", { method: "POST" }),

  adminSessions: () => request<{ items: AdminSession[] }>("/admin/sessions"),

  adminRevokeSession: (token: string) =>
    request<{ revoked: boolean }>(`/admin/sessions/${encodeURIComponent(token)}`, {
      method: "DELETE",
    }),

  adminRevokeProfile: (id: number) =>
    request<{ revoked: number }>(`/admin/profiles/${id}/sessions`, { method: "DELETE" }),

  adminSetAdmin: (id: number, isAdmin: boolean) =>
    request<{ isAdmin: boolean }>(`/admin/profiles/${id}/admin`, {
      method: "PUT",
      body: JSON.stringify({ isAdmin }),
    }),

  adminOverride: (id: string, patch: Record<string, unknown>) =>
    request<{ movie: Movie }>(`/admin/movies/${encodeURIComponent(id)}/override`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  savePrefs: (prefs: PlayerPrefs) =>
    request<PlayerPrefs>("/library/prefs", { method: "PUT", body: JSON.stringify(prefs) }),
};

/**
 * Progress pings fire on a timer and on unload. `sendBeacon` is the only thing
 * that reliably survives a tab close, so the final position isn't lost.
 */
export function beaconProgress(movieId: string, position: number, duration: number) {
  const url = `/api/library/progress/${encodeURIComponent(movieId)}`;
  const payload = JSON.stringify({ position, duration });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch(url, { method: "PUT", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true });
}
