const fs = require("fs");
const path = require("path");
const axios = require("axios");

const ROOT = path.join(__dirname, "../data/images");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function todayDir() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return path.join(String(yyyy), mm, dd);
}

function guessExt(mime, fallback) {
  if (!mime) return fallback || "bin";
  const m = mime.toLowerCase();

  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("svg")) return "svg";

  if (m.includes("mp4")) return "mp4";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("webm")) return "webm";
  if (m.includes("x-matroska") || m.includes("matroska") || m.includes("mkv")) return "mkv";

  if (m.includes("mpeg")) return "mp3";
  if (m.includes("wav") || m.includes("wave")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("m4a")) return "m4a";
  if (m.includes("aac")) return "aac";
  if (m.includes("flac")) return "flac";

  return fallback || "bin";
}

function sanitizeUsername(name) {
  const normalized = String(name || "unknown").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const safe = normalized
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  return safe || "unknown";
}

function formatClock(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}${mm}${ss}`;
}

function resolveUniquePath(baseDir, baseName, ext) {
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? "" : `_${attempt + 1}`;
    const filename = `${baseName}${suffix}.${ext}`;
    const absPath = path.join(baseDir, filename);
    if (!fs.existsSync(absPath)) {
      return { filename, absPath };
    }
    attempt += 1;
  }
}

function writeMedia(buffer, ext, opts = {}) {
  ensureDir(ROOT);
  const dated = path.join(ROOT, todayDir());
  ensureDir(dated);

  const username = sanitizeUsername(opts.username);
  const clock = formatClock(opts.timestamp);
  const baseName = `${username}_${clock}`;
  const { filename, absPath } = resolveUniquePath(dated, baseName, ext);
  const relPath = path.relative(ROOT, absPath);

  fs.writeFileSync(absPath, buffer);

  return { absPath, relPath, bytes: buffer.length, filename };
}

/**
 * Save media from raw Buffer
 * @param {Buffer} buffer
 * @param {Object} opts
 * @param {string} [opts.mime] - optional mime type
 * @param {string} [opts.originalName] - for extension fallback
 * @param {string} [opts.username] - discord username
 * @param {Date|string|number} [opts.timestamp] - message timestamp
 */
function saveImageFromBuffer(buffer, opts = {}) {
  if (!buffer || !buffer.length) throw new Error("empty buffer");

  const originalName = opts.originalName ? String(opts.originalName) : "";
  const fallbackExt = originalName.includes(".")
    ? originalName.split(".").pop().toLowerCase()
    : undefined;
  const ext = guessExt(opts.mime, fallbackExt);
  const out = writeMedia(buffer, ext, opts);

  return {
    ok: true,
    bytes: out.bytes,
    ext,
    absPath: out.absPath,
    relPath: out.relPath,
    filename: out.filename,
    mime: opts.mime || null,
  };
}

/**
 * Save media by URL using axios
 * @param {string} url
 * @param {Object} opts
 * @param {string} [opts.mime]
 * @param {string} [opts.originalName]
 * @param {string} [opts.username]
 * @param {Date|string|number} [opts.timestamp]
 */
async function saveImageFromUrl(url, opts = {}) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const mime = opts.mime || res.headers["content-type"];
  const buf = Buffer.from(res.data);
  return saveImageFromBuffer(buf, {
    mime,
    originalName: opts.originalName || url,
    username: opts.username,
    timestamp: opts.timestamp,
  });
}

module.exports = { saveImageFromBuffer, saveImageFromUrl };
