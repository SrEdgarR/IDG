import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { desktopHarness } from "./desktop-harness.mjs";

const root = process.cwd();
await mkdir(path.join(root, ".local"), { recursive: true });
const ffmpeg = process.env.IDG_MEDIA_FFMPEG;
assert.ok(ffmpeg && path.isAbsolute(ffmpeg), "Set IDG_MEDIA_FFMPEG to an absolute, verified FFmpeg path.");
const ffprobe = path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
await Promise.all([access(ffmpeg), access(ffprobe)]);
const ffmpegVersion = spawnSync(ffmpeg, ["-version"], { encoding: "utf8", windowsHide: true });
const ffprobeVersion = spawnSync(ffprobe, ["-version"], { encoding: "utf8", windowsHide: true });
assert.equal(ffmpegVersion.status, 0);
assert.equal(ffprobeVersion.status, 0);
assert.equal(ffmpegVersion.stdout.match(/version\s+(\S+)/)?.[1], ffprobeVersion.stdout.match(/version\s+(\S+)/)?.[1]);

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { ...options, encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${path.basename(executable)} failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}

const fixtureDir = await mkdtemp(path.join(root, ".local/phase10-media-e2e-"));
const hlsDir = path.join(fixtureDir, "hls");
const longDir = path.join(fixtureDir, "long");
const dashDir = path.join(fixtureDir, "dash");
await Promise.all([mkdir(hlsDir), mkdir(longDir), mkdir(dashDir)]);
const segmentArgs = (folder, prefix, playlist) => [
  "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24",
  "-t", "3", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-g", "24", "-keyint_min", "24",
  "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-hls_time", "1", "-hls_playlist_type", "vod",
  "-hls_segment_filename", path.join(folder, `${prefix}-%03d.ts`), path.join(folder, playlist),
];
run(ffmpeg, segmentArgs(hlsDir, "video", "video.m3u8"));
run(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=44100",
  "-t", "3", "-vn", "-c:a", "aac", "-b:a", "64k", "-hls_time", "1", "-hls_playlist_type", "vod",
  "-hls_segment_filename", path.join(hlsDir, "audio-%03d.ts"), path.join(hlsDir, "audio.m3u8"),
]);
run(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24",
  "-f", "lavfi", "-i", "sine=frequency=700:sample_rate=44100", "-t", "3", "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "libx264", "-preset", "ultrafast", "-g", "24", "-keyint_min", "24", "-sc_threshold", "0",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-hls_time", "1", "-hls_playlist_type", "vod",
  "-hls_segment_filename", path.join(hlsDir, "muxed-%03d.ts"), path.join(hlsDir, "muxed.m3u8"),
]);
await writeFile(path.join(hlsDir, "master.m3u8"), `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Español",LANGUAGE="es",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=320x180,CODECS="avc1.42c00c,mp4a.40.2",AUDIO="audio"\nvideo.m3u8\n`);
await writeFile(path.join(hlsDir, "missing.m3u8"), "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXTINF:1.0,\nnot-present.ts\n#EXT-X-ENDLIST\n");
await writeFile(path.join(hlsDir, "missing-master.m3u8"), `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Español",LANGUAGE="es",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=320x180,CODECS="avc1.42c00c,mp4a.40.2",AUDIO="audio"\nmissing.m3u8\n`);
await writeFile(path.join(hlsDir, "encrypted.m3u8"), "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXTINF:1.0,\nsegment.ts\n#EXT-X-ENDLIST\n");
await writeFile(path.join(hlsDir, "truncated.m3u8"), "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXTINF:3.0,\nmuxed-000.ts\n#EXT-X-ENDLIST\n");
await writeFile(path.join(hlsDir, "redirect-limit.m3u8"), "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXTINF:1.0,\n../../redirect-limit/0\n#EXT-X-ENDLIST\n");

run(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
  "-t", "600", "-vn", "-c:a", "aac", "-b:a", "32k", "-hls_time", "30", "-hls_playlist_type", "vod",
  "-hls_segment_filename", path.join(longDir, "audio-%03d.ts"), path.join(longDir, "audio.m3u8"),
]);
await writeFile(path.join(longDir, "master.m3u8"), `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Español",LANGUAGE="es",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=320x180,CODECS="avc1.42c00c,mp4a.40.2",AUDIO="audio"\n../hls/video.m3u8\n`);

const dashMpd = path.join(dashDir, "generated.mpd");
run(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24",
  "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=44100", "-t", "3", "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "libx264", "-preset", "ultrafast", "-g", "24", "-keyint_min", "24", "-sc_threshold", "0",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-f", "dash", "-seg_duration", "3",
  "-use_template", "0", "-use_timeline", "0", dashMpd,
], { cwd: dashDir });
const dashFiles = await readdir(dashDir);
const videoSegments = dashFiles.filter((name) => /^chunk-stream0-\d+\.m4s$/.test(name)).sort();
const audioSegments = dashFiles.filter((name) => /^chunk-stream1-\d+\.m4s$/.test(name)).sort();
assert.ok(videoSegments.length > 0 && audioSegments.length > 0, "FFmpeg produced separate DASH audio and video segments.");
assert.equal(3_000_000 % videoSegments.length, 0);
assert.equal(3_000_000 % audioSegments.length, 0);
const segmentList = (init, segments, duration) => `<SegmentList timescale="1000000" duration="${duration}"><Initialization sourceURL="${init}"/>${segments.map((name) => `<SegmentURL sourceURL="${name}"/>`).join("")}</SegmentList>`;
await writeFile(path.join(dashDir, "index.mpd"), `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT3S"><BaseURL>dash/</BaseURL><Period duration="PT3S"><AdaptationSet contentType="video" mimeType="video/mp4"><Representation id="video" bandwidth="620000" mimeType="video/mp4" codecs="avc1.42c00c">${segmentList("init-stream0.m4s", videoSegments, 3_000_000 / videoSegments.length)}</Representation></AdaptationSet><AdaptationSet contentType="audio" mimeType="audio/mp4" lang="es"><Representation id="audio" bandwidth="64000" mimeType="audio/mp4" codecs="mp4a.40.2">${segmentList("init-stream1.m4s", audioSegments, 3_000_000 / audioSegments.length)}</Representation></AdaptationSet></Period></MPD>`);
await writeFile(path.join(fixtureDir, "index.mpd"), await readFile(path.join(dashDir, "index.mpd")));

const sourceHashes = new Map();
for (const folder of [hlsDir, longDir, dashDir]) {
  for (const name of await readdir(folder)) {
    const file = path.join(folder, name);
    if ((await stat(file)).isFile()) sourceHashes.set(file, createHash("sha256").update(await readFile(file)).digest("hex"));
  }
}
const requests = [];
const mime = (file) => ({
  ".m3u8": "application/vnd.apple.mpegurl", ".mpd": "application/dash+xml", ".ts": "video/mp2t", ".m4s": "video/mp4",
}[path.extname(file)] ?? "application/octet-stream");
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  requests.push(url.pathname);
  if (url.pathname === "/redirect/media.m3u8") {
    response.writeHead(302, { location: "/assets/hls/master.m3u8" });
    response.end();
    return;
  }
  const redirectHop = url.pathname.match(/^\/redirect-limit\/(\d+)$/);
  if (redirectHop) {
    const hop = Number(redirectHop[1]);
    if (hop < 6) {
      response.writeHead(302, { location: `/redirect-limit/${hop + 1}` });
      response.end();
      return;
    }
    const bytes = await readFile(path.join(hlsDir, "video-000.ts"));
    response.writeHead(200, { "content-type": "video/mp2t", "content-length": bytes.length });
    response.end(bytes);
    return;
  }
  const slow = url.pathname.startsWith("/slow/");
  const relative = url.pathname.replace(/^\/(?:assets|slow)\//, "");
  const file = path.resolve(fixtureDir, relative);
  if (!file.startsWith(fixtureDir + path.sep)) {
    response.writeHead(400).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, { "content-type": mime(file), "content-length": bytes.length, "cache-control": "no-store" });
    if (!slow || !file.endsWith(".ts")) {
      response.end(bytes);
      return;
    }
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      if (response.destroyed) return;
      response.write(bytes.subarray(offset, offset + 8192));
      await delay(75);
    }
    response.end();
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let app;
try {
  app = await desktopHarness();
  const current = await app.command("get_app_preferences");
  assert.equal(current.kind, "app_preferences");
  const saved = await app.command({ set_app_preferences: { preferences: { ...current.preferences, media_ffmpeg_path: ffmpeg } } });
  assert.equal(saved.kind, "app_preferences");

  const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
  const track = async (names, folder, destination) => writeFile(destination, Buffer.concat(await Promise.all(names.map((name) => readFile(path.join(folder, name))))));
  const reference = (inputs, output, format, audioOnly = false) => {
    const args = ["-hide_banner", "-loglevel", "error", "-nostats", "-nostdin"];
    for (const input of inputs) args.push("-protocol_whitelist", "file", "-threads", "2", "-i", input);
    if (audioOnly) args.push("-map", "0:a:0", "-vn", "-c:a", format === "mp3" ? "libmp3lame" : format === "flac" ? "flac" : "copy");
    else args.push("-map", "0:v:0", "-map", "1:a:0", "-c", "copy");
    args.push("-threads", "2", "-n", "-f", format, output);
    run(ffmpeg, args);
  };
  const referenceMuxed = (input, output) => run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-nostats", "-nostdin", "-protocol_whitelist", "file", "-threads", "2", "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-threads", "2", "-n", "-f", "mp4", output,
  ]);
  const probe = (file) => JSON.parse(run(ffprobe, ["-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file]));
  const addFromDialog = async (url, initialName, output = null) => {
    await app.page.getByRole("button", { name: "Nueva descarga", exact: true }).click();
    const dialog = app.page.getByRole("dialog", { name: "Nueva descarga", exact: true });
    await dialog.getByLabel("URL del archivo", { exact: true }).fill(url);
    await dialog.getByLabel("Nombre del archivo", { exact: true }).fill(initialName);
    await dialog.getByLabel("Carpeta", { exact: true }).fill(app.files);
    await dialog.getByRole("button", { name: "Analizar HLS/DASH" }).click();
    await dialog.getByLabel("Salida multimedia").waitFor();
    const finalName = `${initialName.replace(/\.[^.]+$/, "")}.${({ mp4: "mp4", matroska: "mkv", mp3: "mp3", aac: "aac", flac: "flac", audio_original: "mka" })[output ?? "mp4"]}`;
    if (output) {
      await dialog.getByLabel("Salida multimedia").selectOption(output);
      assert.equal(await dialog.getByLabel("Salida multimedia").inputValue(), output);
    }
    assert.equal(await dialog.getByLabel("Nombre del archivo").inputValue(), finalName);
    await dialog.getByRole("button", { name: "Descargar ahora" }).click();
    await dialog.waitFor({ state: "hidden" });
    return finalName;
  };
  const waitState = async (name, states, timeoutMs = 120_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = app.jobs().find((item) => item.name === name);
      if (job && states.includes(job.state)) return job;
      await delay(25);
    }
    throw new Error(`Timed out waiting for ${name} to enter ${states.join("/")}.`);
  };
  const waitForState = async (name, states, timeoutMs = 120_000) => {
    const deadline = Date.now() + timeoutMs;
    const row = app.page.locator(".download-row").filter({ hasText: name });
    while (Date.now() < deadline) {
      const state = await row.getAttribute("data-state").catch(() => null);
      if (state && states.includes(state)) return row;
      await delay(20);
    }
    throw new Error(`UI state for ${name} did not reach ${states.join("/")}.`);
  };
  const verifyOutput = async (name, expectedHash, streams) => {
    const file = path.join(app.files, name);
    const state = await waitState(name, ["completed", "failed"]);
    assert.equal(state.state, "completed", JSON.stringify({
      message: state.message ?? "media job failed",
      stage: state.media_stage,
      durable_bytes: state.durable_bytes,
      received_bytes: state.received_bytes,
    }));
    assert.equal(await sha256(file), expectedHash, `${name}: final output hash`);
    const info = probe(file);
    assert.ok(Number(info.format.duration) >= 2.5, `${name}: ffprobe duration`);
    assert.deepEqual(info.streams.map((stream) => stream.codec_type).sort(), streams);
    return file;
  };

  const sourceVideo = path.join(hlsDir, "video.track");
  const sourceAudio = path.join(hlsDir, "audio.track");
  await track((await readdir(hlsDir)).filter((name) => /^video-\d+\.ts$/.test(name)).sort(), hlsDir, sourceVideo);
  await track((await readdir(hlsDir)).filter((name) => /^audio-\d+\.ts$/.test(name)).sort(), hlsDir, sourceAudio);
  const expectedHls = path.join(fixtureDir, "expected-hls.mp4");
  reference([sourceVideo, sourceAudio], expectedHls, "mp4");
  const hlsName = await addFromDialog(`${baseUrl}/redirect/media.m3u8`, "hls-redirect.m3u8");
  await verifyOutput(hlsName, await sha256(expectedHls), ["audio", "video"]);
  assert.ok(requests.includes("/redirect/media.m3u8") && requests.includes("/assets/hls/video.m3u8"), "HLS relative references resolve from the final redirect URL.");

  const muxedTrack = path.join(hlsDir, "muxed.track");
  await track((await readdir(hlsDir)).filter((name) => /^muxed-\d+\.ts$/.test(name)).sort(), hlsDir, muxedTrack);
  const expectedMuxed = path.join(fixtureDir, "expected-muxed.mp4");
  referenceMuxed(muxedTrack, expectedMuxed);
  const muxedName = await addFromDialog(`${baseUrl}/assets/hls/muxed.m3u8`, "hls-muxed.m3u8");
  await verifyOutput(muxedName, await sha256(expectedMuxed), ["audio", "video"]);

  const truncatedName = await addFromDialog(`${baseUrl}/assets/hls/truncated.m3u8`, "hls-duration-mismatch.m3u8");
  const mismatchedDuration = await waitState(truncatedName, ["completed", "failed"]);
  assert.equal(mismatchedDuration.state, "failed", "a shorter media result must not publish against the declared duration");
  assert.equal(mismatchedDuration.error, "representation");
  assert.equal(await stat(path.join(app.files, truncatedName)).then(() => true, () => false), false);
  assert.equal((await readdir(app.files)).some((name) => name.startsWith(`${truncatedName}.idgpart.media-output-`)), false, "duration rejection removes the generated unverified file");

  const dashVideoTrack = path.join(dashDir, "video.track");
  const dashAudioTrack = path.join(dashDir, "audio.track");
  await track(["init-stream0.m4s", ...videoSegments], dashDir, dashVideoTrack);
  await track(["init-stream1.m4s", ...audioSegments], dashDir, dashAudioTrack);
  const expectedDash = path.join(fixtureDir, "expected-dash.mp4");
  reference([dashVideoTrack, dashAudioTrack], expectedDash, "mp4");
  const dashName = await addFromDialog(`${baseUrl}/assets/index.mpd`, "dash-local.mpd");
  await verifyOutput(dashName, await sha256(expectedDash), ["audio", "video"]);

  const expectedMp3 = path.join(fixtureDir, "expected-audio.mp3");
  reference([sourceAudio], expectedMp3, "mp3", true);
  const mp3Name = await addFromDialog(`${baseUrl}/assets/hls/master.m3u8`, "extracted.m3u8", "mp3");
  await verifyOutput(mp3Name, await sha256(expectedMp3), ["audio"]);

  const jobCountBeforeInvalid = app.jobs().length;
  await app.page.getByRole("button", { name: "Nueva descarga", exact: true }).click();
  let dialog = app.page.getByRole("dialog", { name: "Nueva descarga", exact: true });
  await dialog.getByLabel("URL del archivo", { exact: true }).fill(`${baseUrl}/assets/hls/encrypted.m3u8`);
  await dialog.getByLabel("Nombre del archivo", { exact: true }).fill("reject-encrypted.m3u8");
  await dialog.getByLabel("Carpeta", { exact: true }).fill(app.files);
  await dialog.getByRole("button", { name: "Analizar HLS/DASH" }).click();
  assert.ok((await dialog.getByRole("alert").textContent())?.length);
  assert.equal(app.jobs().length, jobCountBeforeInvalid, "invalid manifest created no job");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();

  const missingName = await addFromDialog(`${baseUrl}/assets/hls/missing-master.m3u8`, "missing-segment.m3u8");
  const failedSegment = await waitState(missingName, ["completed", "failed"]);
  assert.equal(failedSegment.state, "failed");
  assert.equal(await stat(path.join(app.files, missingName)).then(() => true, () => false), false);

  const redirectName = await addFromDialog(`${baseUrl}/assets/hls/redirect-limit.m3u8`, "redirect-limit.m3u8");
  const redirectJob = await waitState(redirectName, ["completed", "failed"]);
  assert.equal(redirectJob.state, "failed");
  assert.equal(redirectJob.error, "http_status");
  assert.equal(requests.filter((pathname) => pathname.startsWith("/redirect-limit/")).length, 6, "segment redirects stop after five followed redirects");
  assert.equal(await stat(path.join(app.files, redirectName)).then(() => true, () => false), false);

  const pauseName = await addFromDialog(`${baseUrl}/slow/hls/master.m3u8`, "pause-resume.m3u8");
  let pausedRow = await waitForState(pauseName, ["Downloading"]);
  const checkpointDeadline = Date.now() + 15_000;
  while (Date.now() < checkpointDeadline) {
    if ((await readdir(app.files)).some((name) => name.startsWith(`${pauseName}.idgpart.media-`) && name.endsWith(".seg"))) break;
    await delay(25);
  }
  assert.ok((await readdir(app.files)).some((name) => name.startsWith(`${pauseName}.idgpart.media-`) && name.endsWith(".seg")), "one full segment must be hash-checkpointed before pausing");
  await pausedRow.getByRole("button", { name: `Pausar ${pauseName}` }).click();
  await waitState(pauseName, ["paused"]);
  const pausedFiles = await readdir(app.files);
  assert.ok(pausedFiles.some((name) => name.includes(`${pauseName}.idgpart.media-`) && name.endsWith(".seg")), "pause retains hash-checked segment checkpoints");
  pausedRow = await waitForState(pauseName, ["Paused"]);
  await pausedRow.getByRole("button", { name: `Reanudar ${pauseName}` }).click();
  await verifyOutput(pauseName, await sha256(expectedHls), ["audio", "video"]);

  const longTrack = path.join(longDir, "audio.track");
  await track((await readdir(longDir)).filter((name) => /^audio-\d+\.ts$/.test(name)).sort(), longDir, longTrack);
  const expectedCancelled = path.join(fixtureDir, "expected-cancelled.mp3");
  reference([longTrack], expectedCancelled, "mp3", true);
  const cancelledName = await addFromDialog(`${baseUrl}/assets/long/master.m3u8`, "cancel-processing.m3u8", "mp3");
  const processingRow = await waitForState(cancelledName, ["Processing"]);
  await processingRow.getByLabel(`Acciones de ${cancelledName}`).click();
  await app.page.getByRole("group", { name: "Acciones de descarga" }).getByRole("button", { name: "Cancelar" }).click();
  const cancelled = await waitState(cancelledName, ["cancelled"]);
  assert.equal(cancelled.state, "cancelled");
  assert.equal(await stat(path.join(app.files, cancelledName)).then(() => true, () => false), false);
  assert.equal((await readdir(app.files)).some((name) => name.includes(`${cancelledName}.idgpart.media-`)), false, "cancel removes only this job's temporary files after stopping FFmpeg");

  for (const [file, expected] of sourceHashes) assert.equal(await sha256(file), expected, "local source fixture remains unchanged");
  console.log(`PASS Tauri media E2E: HLS redirect+remux SHA-256 ${await sha256(path.join(app.files, hlsName))}; embedded-audio HLS SHA-256 ${await sha256(path.join(app.files, muxedName))}; DASH separate tracks SHA-256 ${await sha256(path.join(app.files, dashName))}; MP3 conversion SHA-256 ${await sha256(path.join(app.files, mp3Name))}; truncated-duration rejection, segment failure, redirect bound, pause/resume and FFmpeg cancellation verified. FFmpeg ${ffmpegVersion.stdout.match(/version\s+(\S+) /)?.[1]}.`);
} finally {
  await app?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
