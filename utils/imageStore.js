const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
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
  return fallback || "bin";
}

function writeWithDedupe(buffer, ext) {
  ensureDir(ROOT);
  const dated = path.join(ROOT, todayDir());
  ensureDir(dated);

  const hash = sha256(buffer);
  const filename = `${hash}.${ext}`;
  const absPath = path.join(dated, filename);
  const relPath = path.relative(ROOT, absPath);

  if (!fs.existsSync(absPath)) {
    fs.writeFileSync(absPath, buffer);
    // sidecar metadata
    const meta = {
      bytes: buffer.length,
      sha256: hash,
      savedAt: new Date().toISOString(),
      relPath,
    };
    fs.writeFileSync(absPath + ".json", JSON.stringify(meta, null, 2));
  }

  return { hash, absPath, relPath, bytes: buffer.length };
}

/**
 * Save image from raw Buffer
 * @param {Buffer} buffer
 * @param {Object} opts
 * @param {string} [opts.mime] - optional mime type
 * @param {string} [opts.originalName] - for extension fallback
 */
function saveImageFromBuffer(buffer, opts = {}) {
  if (!buffer || !buffer.length) throw new Error("empty buffer");
  const fallbackExt = opts.originalName ? String(opts.originalName).split(".").pop() : undefined;
  const ext = guessExt(opts.mime, fallbackExt);
  const out = writeWithDedupe(buffer, ext);
  return {
    ok: true,
    bytes: out.bytes,
    sha256: out.hash,
    ext,
    absPath: out.absPath,
    relPath: out.relPath,
    mime: opts.mime || null,
  };
}

/**
 * Save image by URL using axios
 * @param {string} url
 * @param {Object} opts
 * @param {string} [opts.mime]
 * @param {string} [opts.originalName]
 */
async function saveImageFromUrl(url, opts = {}) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const mime = opts.mime || res.headers["content-type"];
  const buf = Buffer.from(res.data);
  return saveImageFromBuffer(buf, { mime, originalName: opts.originalName || url });
}

module.exports = { saveImageFromBuffer, saveImageFromUrl };
