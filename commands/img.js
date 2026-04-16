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
  if (!fs.existsSync(gitDir)) return "Không tìm thấy thư mục .git ở root repo.";

  const busyMarkers = [
    { file: "MERGE_HEAD", message: "Repo đang ở trạng thái merge dang dở." },
    { file: "rebase-merge", message: "Repo đang ở trạng thái rebase dang dở." },
    { file: "rebase-apply", message: "Repo đang ở trạng thái rebase/apply dang dở." },
    { file: "CHERRY_PICK_HEAD", message: "Repo đang ở trạng thái cherry-pick dang dở." },
    { file: "REVERT_HEAD", message: "Repo đang ở trạng thái revert dang dở." },
    { file: "BISECT_LOG", message: "Repo đang ở trạng thái bisect." },
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
      return msg.reply("❌ Bạn không có quyền dùng lệnh này.");
    }

    if (isRunning) {
      return msg.reply("⏳ Đang có một phiên `-img` chạy. Chờ xong rồi gọi lại.");
    }

    const repoRoot = path.join(__dirname, "..");
    const busyReason = detectGitBusy(repoRoot);
    if (busyReason) {
      return msg.reply(`❌ ${busyReason} Hãy xử lý xong rồi thử lại.`);
    }

    try {
      isRunning = true;
      await msg.reply("🔄 Đang chạy `git add .` → `git commit -m \"img\"` → `git push`...");

      const branch = await getCurrentBranch(repoRoot);

      const addRes = await runGit(["add", "."], repoRoot);
      if (addRes.code !== 0) {
        return msg.reply(`❌ Lỗi ở bước \`git add .\`${wrapLog(fmtOutput(addRes.stdout, addRes.stderr))}`);
      }

      const diffRes = await runGit(["diff", "--cached", "--quiet"], repoRoot);
      if (diffRes.code === 0) {
        return msg.reply("⚠️ Không có thay đổi nào để commit.");
      }
      if (diffRes.code !== 1) {
        return msg.reply(`❌ Không kiểm tra được thay đổi đã stage.${wrapLog(fmtOutput(diffRes.stdout, diffRes.stderr))}`);
      }

      const commitRes = await runGit(["commit", "-m", "img"], repoRoot);
      if (commitRes.code !== 0) {
        return msg.reply(`❌ Lỗi ở bước \`git commit -m \"img\"\`${wrapLog(fmtOutput(commitRes.stdout, commitRes.stderr))}`);
      }

      const pushRes = await runGit(["push"], repoRoot);
      if (pushRes.code !== 0) {
        const branchText = branch ? ` (branch hiện tại: \`${branch}\`)` : "";
        return msg.reply(`❌ Lỗi ở bước \`git push\`${branchText}${wrapLog(fmtOutput(pushRes.stdout, pushRes.stderr))}`);
      }

      return msg.reply(`✅ Đã add, commit và push thành công${branch ? ` lên branch \`${branch}\`` : ""}.`);
    } finally {
      isRunning = false;
    }
  },
};
