/**
 * Thin FFmpeg wrapper for the `video-ingest` BullMQ job.
 *
 * Exports:
 *  - `buildFfmpegArgs` — pure arg array builder (testable, no side effects)
 *  - `extractAudioAndFrames` — runs the single-invocation FFmpeg command,
 *    returns the paths of the generated audio + frame files and the
 *    probed duration in seconds.
 *
 * Audio output:  MP3 mono 16 kHz 64 kbps (`-acodec libmp3lame -ac 1 -ar 16000 -b:a 64k`)
 * Frame output:  one JPEG every 10 s, scaled to 1280 px wide (`-vf "fps=1/10,scale=1280:-1" -q:v 2`)
 *
 * Single invocation reason: one FFmpeg process that produces both outputs
 * avoids a second transcode pass. Frames are extracted from the same
 * decoded video stream as the audio, so no additional encode cost.
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface ExtractOptions {
  /** Path to the FFmpeg binary. Defaults to "ffmpeg" on PATH. */
  ffmpegPath?: string;
}

export interface ExtractResult {
  /** Absolute path to the extracted MP3. */
  audioPath: string;
  /** Absolute paths of the extracted frame JPEGs, sorted lexicographically. */
  framePaths: string[];
  /** Probed duration in seconds. */
  durationSeconds: number;
}

const defaultOptions: ExtractOptions = {
  ffmpegPath: "ffmpeg",
};

/**
 * Build the FFmpeg argument array for a single-invocation extract.
 * Pure — no I/O, fully testable.
 *
 * @param inputPath  Absolute path to the source video.
 * @param outputDir  Absolute path to the output directory.
 * @param opts       Optional FFmpeg path override.
 */
export const buildFfmpegArgs = (
  inputPath: string,
  outputDir: string,
  opts: ExtractOptions = defaultOptions,
): string[] => {
  const ffmpegCmd = opts.ffmpegPath ?? defaultOptions.ffmpegPath!;
  return [
    "-y", // overwrite output files without asking
    "-i", inputPath,
    // Audio output: MP3 mono 16 kHz 64 kbps
    "-vn",
    "-acodec", "libmp3lame",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "64k",
    join(outputDir, "audio.mp3"),
    // Frame output: 1 fps, scaled to 1280 px wide, JPEG quality 2
    "-vf", "fps=1/10,scale=1280:-1",
    "-q:v", "2",
    join(outputDir, "frame_%03d.jpg"),
  ];
};

/**
 * Run FFmpeg once, producing both audio and frame outputs.
 * Also runs ffprobe to probe the exact audio duration.
 *
 * @param inputPath  Absolute path to the source video.
 * @param outputDir  Absolute path to a temporary output directory.
 * @param opts      Optional FFmpeg path override.
 */
export const extractAudioAndFrames = async (
  inputPath: string,
  outputDir: string,
  opts: ExtractOptions = defaultOptions,
): Promise<ExtractResult> => {
  const ffmpeg = opts.ffmpegPath ?? defaultOptions.ffmpegPath!;
  const args = buildFfmpegArgs(inputPath, outputDir, opts);

  await runFfmpeg(ffmpeg, args);

  // Probe the audio duration with ffprobe
  const durationSeconds = await probeDuration(join(outputDir, "audio.mp3"));

  const files = await readdir(outputDir);
  const framePaths = files
    .filter((f) => f.startsWith("frame_") && f.endsWith(".jpg"))
    .map((f) => join(outputDir, f))
    .sort();

  return {
    audioPath: join(outputDir, "audio.mp3"),
    framePaths,
    durationSeconds,
  };
};

/**
 * Spawn FFmpeg and wait for it to exit. Rejects if the process exits
 * non-zero.
 */
const runFfmpeg = (cmd: string, args: string[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new FfmpegError(code, stderr));
      }
    });

    proc.on("error", (err) => {
      reject(new FfmpegError(null, `Failed to spawn FFmpeg: ${err.message}`));
    });
  });
};

/**
 * Probe an audio file for its duration in seconds using ffprobe.
 */
const probeDuration = async (audioPath: string): Promise<number> => {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const parsed = parseFloat(stdout.trim());
        resolve(isNaN(parsed) ? 0 : Math.round(parsed));
      } else {
        // ffprobe missing or file unreadable — fall back to 0 rather than
        // failing the whole job. The dashboard can handle an unknown duration.
        resolve(0);
      }
    });

    proc.on("error", () => resolve(0));
  });
};

/** Error wrapper for non-zero FFmpeg exits. */
export class FfmpegError extends Error {
  constructor(
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(stderr || `FFmpeg exited with code ${exitCode}`);
    this.name = "FfmpegError";
  }
}
