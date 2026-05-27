import { useCallback, useEffect, useRef, useState } from "react";
import { api, beaconProgress } from "@/api";
import { cx, formatTime } from "@/lib/format";
import {
  FullscreenIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  SettingsIcon,
  SkipIcon,
  SubtitlesIcon,
  VolumeIcon,
} from "@/components/Icons";
import type { Movie, PlayerPrefs } from "@/types";

const SEEK_STEP = 10;
const SAVE_INTERVAL_MS = 10_000;
const CONTROLS_HIDE_MS = 2800;
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface Props {
  movie: Movie;
  onEnded?: () => void;
}

export function VideoPlayer({ movie, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number>();
  const lastSaved = useRef(0);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(movie.durationSeconds || 0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState<"none" | "settings" | "subtitles">("none");
  const [activeTrack, setActiveTrack] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [resumeFrom, setResumeFrom] = useState<number | null>(null);
  const [scrubPreview, setScrubPreview] = useState<{ time: number; x: number } | null>(null);

  // ---- preferences ------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    api
      .prefs()
      .then((prefs: PlayerPrefs) => {
        if (cancelled || !videoRef.current) return;
        videoRef.current.volume = prefs.volume;
        videoRef.current.muted = prefs.muted;
        videoRef.current.playbackRate = prefs.rate;
        setVolume(prefs.volume);
        setMuted(prefs.muted);
        setRate(prefs.rate);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const persistPrefs = useCallback((next: Partial<PlayerPrefs>) => {
    const video = videoRef.current;
    if (!video) return;
    void api
      .savePrefs({
        volume: next.volume ?? video.volume,
        muted: next.muted ?? video.muted,
        rate: next.rate ?? video.playbackRate,
      })
      .catch(() => undefined);
  }, []);

  // ---- progress ---------------------------------------------------------

  const saveProgress = useCallback(
    (force = false) => {
      const video = videoRef.current;
      if (!video || !video.duration || Number.isNaN(video.duration)) return;
      if (!force && Math.abs(video.currentTime - lastSaved.current) < 5) return;
      lastSaved.current = video.currentTime;
      void api.saveProgress(movie.id, video.currentTime, video.duration).catch(() => undefined);
    },
    [movie.id],
  );

  useEffect(() => {
    const interval = window.setInterval(() => playing && saveProgress(), SAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [playing, saveProgress]);

  // A closing tab never gets to finish a fetch — beacon is the only way out.
  useEffect(() => {
    const flush = () => {
      const video = videoRef.current;
      if (video?.duration && video.currentTime > 0) {
        beaconProgress(movie.id, video.currentTime, video.duration);
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
    };
  }, [movie.id]);

  // ---- controls visibility ---------------------------------------------

  const nudgeControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    // Menus stay open until dismissed; hiding the bar under them is maddening.
    if (!videoRef.current?.paused && menu === "none") {
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    }
  }, [menu]);

  useEffect(() => {
    nudgeControls();
    return () => window.clearTimeout(hideTimer.current);
  }, [playing, menu, nudgeControls]);

  // ---- transport --------------------------------------------------------

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setError("Playback was blocked by the browser."));
    else video.pause();
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || 0);
      nudgeControls();
    },
    [nudgeControls],
  );

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(0, time), video.duration || 0);
  }, []);

  const changeVolume = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video) return;
      const clamped = Math.min(1, Math.max(0, value));
      video.volume = clamped;
      video.muted = clamped === 0;
      setVolume(clamped);
      setMuted(clamped === 0);
      persistPrefs({ volume: clamped, muted: clamped === 0 });
    },
    [persistPrefs],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    persistPrefs({ muted: video.muted });
  }, [persistPrefs]);

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch {
      /* Safari on iPhone only allows fullscreen on the video element itself. */
      const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      video?.webkitEnterFullscreen?.();
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      setError("Picture-in-picture isn't available here.");
    }
  }, []);

  const selectTrack = useCallback((index: number) => {
    const video = videoRef.current;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i += 1) {
      const track = video.textTracks[i];
      if (track) track.mode = i === index ? "showing" : "disabled";
    }
    setActiveTrack(index);
    setMenu("none");
  }, []);

  const changeRate = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.playbackRate = value;
      setRate(value);
      persistPrefs({ rate: value });
      setMenu("none");
    },
    [persistPrefs],
  );

  // ---- keyboard ---------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        return;
      }

      const handlers: Record<string, () => void> = {
        " ": togglePlay,
        k: togglePlay,
        ArrowLeft: () => seekBy(-SEEK_STEP),
        ArrowRight: () => seekBy(SEEK_STEP),
        j: () => seekBy(-SEEK_STEP),
        l: () => seekBy(SEEK_STEP),
        ArrowUp: () => changeVolume((videoRef.current?.volume ?? 0) + 0.1),
        ArrowDown: () => changeVolume((videoRef.current?.volume ?? 0) - 0.1),
        f: () => void toggleFullscreen(),
        m: toggleMute,
        p: () => void togglePip(),
        c: () => selectTrack(activeTrack === -1 ? 0 : -1),
        Home: () => seekTo(0),
        End: () => seekTo((videoRef.current?.duration ?? 0) - 1),
      };

      const handler = handlers[e.key];
      if (handler) {
        e.preventDefault();
        handler();
        nudgeControls();
        return;
      }

      // 0–9 jump to that tenth of the film, like YouTube.
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const video = videoRef.current;
        if (video?.duration) seekTo((Number(e.key) / 10) * video.duration);
        nudgeControls();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeTrack,
    changeVolume,
    nudgeControls,
    seekBy,
    seekTo,
    selectTrack,
    toggleFullscreen,
    toggleMute,
    togglePip,
    togglePlay,
  ]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ---- media element wiring --------------------------------------------

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    setReady(true);

    const saved = movie.progress?.position ?? 0;
    // Offer a resume rather than silently jumping — a surprise seek is worse
    // than one extra click.
    if (saved > 15 && saved < video.duration - 30) setResumeFrom(saved);
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrent(video.currentTime);
    if (video.buffered.length) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }
  };

  const progressPercent = duration ? (current / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  const handleScrub = (e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return { ratio, x: e.clientX - rect.left };
  };

  return (
    <div
      ref={shellRef}
      onMouseMove={nudgeControls}
      onMouseLeave={() => playing && menu === "none" && setControlsVisible(false)}
      className={cx(
        "group/player relative aspect-video w-full overflow-hidden bg-black",
        // Capped to the viewport so the control bar is always reachable without
        // scrolling, whatever the film's aspect ratio is.
        fullscreen ? "h-screen max-h-none rounded-none" : "max-h-[calc(100vh-9rem)] rounded-2xl",
        !controlsVisible && playing && "cursor-none",
      )}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        poster={movie.backdrop ?? movie.poster}
        preload="metadata"
        playsInline
        onClick={togglePlay}
        onDoubleClick={() => void toggleFullscreen()}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onProgress={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          saveProgress(true);
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onEnded={() => {
          saveProgress(true);
          onEnded?.();
        }}
        onError={() =>
          setError(
            movie.playableInBrowser
              ? "This file couldn't be played. It may use a codec your browser doesn't support."
              : `.${movie.container} isn't playable in browsers — use the download button instead.`,
          )
        }
      >
        <source src={movie.streamUrl} />
        {movie.subtitles.map((track, i) => (
          <track
            key={track.url}
            kind="subtitles"
            src={track.url}
            srcLang={track.lang}
            label={track.label}
            default={i === -1}
          />
        ))}
      </video>

      {waiting && ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-amber/30 border-t-amber" />
        </div>
      )}

      {!playing && ready && !error && !resumeFrom && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center bg-ink/30 transition-opacity"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber/90 text-ink shadow-glow transition-transform hover:scale-105">
            <PlayIcon className="ml-1 h-8 w-8" />
          </span>
        </button>
      )}

      {resumeFrom !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/80 backdrop-blur-sm">
          <p className="text-sm text-muted">You stopped at {formatTime(resumeFrom)}</p>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                seekTo(resumeFrom);
                setResumeFrom(null);
                void videoRef.current?.play();
              }}
            >
              <PlayIcon className="h-4 w-4" /> Resume
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                seekTo(0);
                setResumeFrom(null);
                void videoRef.current?.play();
              }}
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/90 px-6 text-center">
          <p className="max-w-md text-sm text-chalk">{error}</p>
          <a href={movie.downloadUrl} className="btn-ghost" download>
            Download instead
          </a>
        </div>
      )}

      {/* ---- control bar ---- */}
      <div
        className={cx(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent px-3 pb-3 pt-16",
          "transition-opacity duration-300 sm:px-5 sm:pb-4",
          controlsVisible || !playing ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {/* scrub bar */}
        <div
          className="group/scrub relative mb-3 h-5 cursor-pointer"
          onClick={(e) => seekTo(handleScrub(e).ratio * duration)}
          onMouseMove={(e) => {
            const { ratio, x } = handleScrub(e);
            setScrubPreview({ time: ratio * duration, x });
          }}
          onMouseLeave={() => setScrubPreview(null)}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") seekBy(-SEEK_STEP);
            if (e.key === "ArrowRight") seekBy(SEEK_STEP);
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-chalk/20 transition-all group-hover/scrub:h-1.5">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-chalk/25"
              style={{ width: `${bufferedPercent}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-amber"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full
                       bg-amber transition-transform group-hover/scrub:scale-100"
            style={{ left: `${progressPercent}%` }}
          />
          {scrubPreview && (
            <span
              className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5
                         text-[11px] font-medium text-chalk"
              style={{ left: `${scrubPreview.x}px` }}
            >
              {formatTime(scrubPreview.time)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <ControlButton onClick={togglePlay} label={playing ? "Pause" : "Play"}>
            {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </ControlButton>

          <ControlButton onClick={() => seekBy(-SEEK_STEP)} label="Back 10 seconds">
            <SkipIcon className="h-5 w-5" back />
          </ControlButton>

          <ControlButton onClick={() => seekBy(SEEK_STEP)} label="Forward 10 seconds">
            <SkipIcon className="h-5 w-5" />
          </ControlButton>

          <div className="group/vol flex items-center">
            <ControlButton onClick={toggleMute} label={muted ? "Unmute" : "Mute"}>
              <VolumeIcon
                className="h-5 w-5"
                level={muted || volume === 0 ? "muted" : volume < 0.5 ? "low" : "high"}
              />
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-chalk/25 opacity-0 transition-all
                         duration-200 group-hover/vol:ml-2 group-hover/vol:w-20 group-hover/vol:opacity-100
                         focus:ml-2 focus:w-20 focus:opacity-100
                         [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-amber"
            />
          </div>

          <span className="ml-1 select-none font-mono text-xs text-chalk/80 sm:text-sm">
            {formatTime(current)} <span className="text-muted">/ {formatTime(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {movie.subtitles.length > 0 && (
              <div className="relative">
                <ControlButton
                  onClick={() => setMenu(menu === "subtitles" ? "none" : "subtitles")}
                  label="Subtitles"
                  active={activeTrack >= 0}
                >
                  <SubtitlesIcon className="h-5 w-5" />
                </ControlButton>
                {menu === "subtitles" && (
                  <Menu>
                    <MenuItem active={activeTrack === -1} onClick={() => selectTrack(-1)}>
                      Off
                    </MenuItem>
                    {movie.subtitles.map((track, i) => (
                      <MenuItem key={track.url} active={activeTrack === i} onClick={() => selectTrack(i)}>
                        {track.label}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>
            )}

            <div className="relative">
              <ControlButton
                onClick={() => setMenu(menu === "settings" ? "none" : "settings")}
                label="Playback speed"
                active={rate !== 1}
              >
                <SettingsIcon className="h-5 w-5" />
              </ControlButton>
              {menu === "settings" && (
                <Menu>
                  <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-widest text-muted">
                    Speed
                  </p>
                  {RATES.map((value) => (
                    <MenuItem key={value} active={rate === value} onClick={() => changeRate(value)}>
                      {value === 1 ? "Normal" : `${value}×`}
                    </MenuItem>
                  ))}
                </Menu>
              )}
            </div>

            <ControlButton onClick={() => void togglePip()} label="Picture in picture">
              <PipIcon className="h-5 w-5" />
            </ControlButton>

            <ControlButton
              onClick={() => void toggleFullscreen()}
              label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              <FullscreenIcon className="h-5 w-5" active={fullscreen} />
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
        active ? "text-amber" : "text-chalk hover:text-amber",
      )}
    >
      {children}
    </button>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-12 right-0 z-10 min-w-[9rem] animate-fade-up overflow-hidden rounded-xl border border-ink-500 bg-ink-700/95 py-1 shadow-card backdrop-blur-xl">
      {children}
    </div>
  );
}

function MenuItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors",
        active ? "text-amber" : "text-chalk/80 hover:bg-ink-600 hover:text-chalk",
      )}
    >
      {children}
      {active && <span className="text-amber">✓</span>}
    </button>
  );
}
