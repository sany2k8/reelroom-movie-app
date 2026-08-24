export interface Profile {
  id: number;
  name: string;
  avatarSeed: string;
  isAdmin?: boolean;
  createdAt?: string;
}

export interface MovieRequest {
  id: number;
  title: string;
  year: number | null;
  note: string | null;
  status: "open" | "fulfilled" | "declined";
  movieId: string | null;
  requester: string | null;
  profileId: number;
  votes: number;
  hasVoted: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminOverview {
  profile: Profile;
  catalog: {
    lastScan: string | null;
    scanning: boolean;
    count: number;
    totalBytes: number;
    missingArtwork: number;
    noSubtitles: number;
    unmatched: { id: string; title: string; file: string }[];
    unplayable: { id: string; title: string; container: string }[];
  };
  storage: { driver: string; location: string };
  tmdb: string;
  watch: { enabled: boolean; stableSeconds: number; pollSeconds: number };
  openRequests: number;
  profiles: Profile[];
  recentActivity: { movieId: string; title: string; who: string; percent: number; at: string }[];
}

export interface AdminSession {
  id: string;
  token: string;
  profileId: number;
  name: string;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface Progress {
  movieId: string;
  position: number;
  duration: number;
  completed: boolean;
  percent: number;
  updatedAt: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profile: string | null;
}

export interface SubtitleTrack {
  lang: string;
  label: string;
  url: string;
}

/** The trimmed shape returned for grids and rails. */
export interface MovieCard {
  id: string;
  title: string;
  year: number | null;
  genres: string[];
  category: string | null;
  rating: number | null;
  quality: string | null;
  runtimeMinutes: number | null;
  durationSeconds: number;
  poster: string;
  backdrop: string | null;
  certification: string | null;
  addedAt: string;
  progress?: Progress | null;
  inWatchlist?: boolean;
  isFavourite?: boolean;
}

export interface Movie extends MovieCard {
  description: string | null;
  tagline: string | null;
  language: string | null;
  voteCount: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioTracks: { codec: string | null; channels: number | null; language: string | null }[];
  trailerKey: string | null;
  cast: CastMember[];
  directors: string[];
  writers: string[];
  tmdbId: number | null;
  imdbId: string | null;
  subtitles: SubtitleTrack[];
  playableInBrowser: boolean;
  container: string;
  sizeBytes: number;
  file: string;
  streamUrl: string;
  downloadUrl: string;
  related: MovieCard[];
}

export interface Rail {
  key: string;
  title: string;
  href: string;
  items: MovieCard[];
}

export interface HomePayload {
  hero: Movie[];
  rails: Rail[];
  stats: { total: number; lastScan: string | null; scanning: boolean; count: number };
}

export interface Facets {
  genres: string[];
  categories: string[];
  years: number[];
  qualities: string[];
  letters: string[];
  total: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PlayerPrefs {
  volume: number;
  muted: boolean;
  rate: number;
}

export type ListName = "watchlist" | "favourite";
