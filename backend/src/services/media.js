import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

let ffprobeAvailable = null;

async function hasFfprobe() {
  if (ffprobeAvailable !== null) return ffprobeAvailable;
  try {
    await execFileAsync("ffprobe", ["-version"]);
    ffprobeAvailable = true;
  } catch {
    ffprobeAvailable = false;
    logger.warn("ffprobe not found — durations and resolution badges fall back to metadata only");
  }
  return ffprobeAvailable;
}

/**
 * Reads real duration/resolution off the file so the UI never has to trust a
 * hand-typed "152 min" that drifted from the actual encode.
 */
export async function probe(filePath) {
  if (!(await hasFfprobe())) return null;

  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );

    const data = JSON.parse(stdout);
    const video = (data.streams || []).find((s) => s.codec_type === "video");
    const audio = (data.streams || []).filter((s) => s.codec_type === "audio");
    const durationSeconds = Number(data.format?.duration) || 0;

    return {
      durationSeconds: Math.round(durationSeconds),
      width: video?.width ?? null,
      height: video?.height ?? null,
      videoCodec: video?.codec_name ?? null,
      audioTracks: audio.map((a) => ({
        codec: a.codec_name ?? null,
        channels: a.channels ?? null,
        language: a.tags?.language ?? null,
      })),
      bitrate: Number(data.format?.bit_rate) || null,
      quality: qualityLabel(video?.height),
    };
  } catch (err) {
    logger.warn({ err: err.message, filePath }, "media.probe_failed");
    return null;
  }
}

export function qualityLabel(height) {
  if (!height) return null;
  if (height >= 2000) return "4K";
  if (height >= 1000) return "1080p";
  if (height >= 700) return "720p";
  if (height >= 500) return "576p";
  return "SD";
}

export function formatRuntime(seconds) {
  if (!seconds) return null;
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
