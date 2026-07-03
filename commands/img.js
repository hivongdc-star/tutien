const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let isRunning = false;

function tailText(text = "", limit = 1800) {
  const s = String(text || "").trim();
  return s.length > limit ? s.slice(-limit) : s;
}

function fmtOutput(stdout = "", stderr = "") {
  const parts = [];
  if (stdout && stdout.trim()) parts.push(`STDOUT:\n${tailText(stdout)}`);
  if (stderr && stderr.trim()) parts.push(`STDERR:\n${tailText(stderr)}`);
  return parts.join("\n\n");
}

function wrapLog(text) {
  const body = String(text || "Không có log.").replace(/```/g, "'''");
  return `\n\n\
\
\
${body}\n\
\
\
`;
}

function runGit(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      windowsHide: true,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += String(d);
    });

    child.stderr.on("data", (d) => {
      stderr += String(d);
    });

    child.on("error", (error) => {
      resolve({ code: -1, stdout, stderr, error });
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr, error: null });
    });
  });
}

function detectGitBusy(repoRoot) {
  const gitDir = path.join(repoRoot, ".git");
  if (!fs.existsSync(gitDir)) return "Không tìm thấy kho lưu trữ ở máy chủ.";

  const busyMarkers = [
    { file: "MERGE_HEAD", message: "Kho lưu trữ đang có thao tác hợp nhất dang dở." },
    { file: "rebase-merge", message: "Kho lưu trữ đang có thao tác sắp xếp lại dang dở." },
    { file: "rebase-apply", message: "Kho lưu trữ đang có thao tác cập nhật dang dở." },
    { file: "CHERRY_PICK_HEAD", message: "Kho lưu trữ đang có thao tác chọn bản ghi dang dở." },
    { file: "REVERT_HEAD", message: "Kho lưu trữ đang có thao tác hoàn nguyên dang dở." },
    { file: "BISECT_LOG", message: "Kho lưu trữ đang ở trạng thái kiểm tra lỗi." },
  ];

  for (const marker of busyMarkers) {
    const abs = path.join(gitDir, marker.file);
    if (fs.existsSync(abs)) return marker.message;
  }

  return null;
}

async function getCurrentBranch(repoRoot) {
  const res = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (res.code !== 0) return null;
  const branch = String(res.stdout || "").trim();
  return branch || null;
}

module.exports = {
  name: "img",
  run: async (client, msg) => {
    if (msg.author.id !== process.env.OWNER_ID) {
      return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    }

    if (isRunning) {
      return msg.reply("⏳ Đang có một phiên đồng bộ ảnh. Chờ xong rồi gọi lại.");
    }

    const repoRoot = path.join(__dirname, "..");
    const busyReason = detectGitBusy(repoRoot);
    if (busyReason) {
      return msg.reply(`❌ ${busyReason} Hãy xử lý xong rồi thử lại.`);
    }

    try {
      isRunning = true;
      await msg.reply("🔄 Đang đồng bộ ảnh vào kho lưu trữ...");

      const branch = await getCurrentBranch(repoRoot);

      const addRes = await runGit(["add", "."], repoRoot);
      if (addRes.code !== 0) {
        return msg.reply("❌ Không thể ghi nhận thay đổi ảnh. Hãy kiểm tra máy chủ.");
      }

      const diffRes = await runGit(["diff", "--cached", "--quiet"], repoRoot);
      if (diffRes.code === 0) {
        return msg.reply("⚠️ Không có ảnh hoặc tài nguyên mới cần đồng bộ.");
      }
      if (diffRes.code !== 1) {
        return msg.reply(`❌ Không thể kiểm tra thay đổi ảnh. Hãy kiểm tra máy chủ.`);
      }

      const commitRes = await runGit(["commit", "-m", "img"], repoRoot);
      if (commitRes.code !== 0) {
        return msg.reply("❌ Không thể tạo mốc đồng bộ ảnh. Hãy kiểm tra máy chủ.");
      }

      const pushRes = await runGit(["push"], repoRoot);
      if (pushRes.code !== 0) {
        return msg.reply("❌ Không thể đẩy ảnh lên kho lưu trữ. Hãy kiểm tra máy chủ.");
      }

      return msg.reply(`✅ Đã đồng bộ ảnh thành công.`);
    } finally {
      isRunning = false;
    }
  },
};
