// utils/logger.js
const fs = require("fs");
const path = require("path");

const logDir = path.join(__dirname, "../logs");

// tạo thư mục logs nếu chưa có
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logFile = path.join(logDir, "bot.log");

// hàm ghi log
function log(message, type = "INFO") {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${type}] ${message}`;

  // ghi ra console
  if (type === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }

  // ghi vào file bot.log
  fs.appendFileSync(logFile, line + "\n", "utf8");
}

// log lỗi
function logError(error, context = "") {
  const message =
    typeof error === "string" ? error : error.stack || JSON.stringify(error);
  log(`${context ? `[${context}] ` : ""}${message}`, "ERROR");
}

// clear log
function clearLogs() {
  fs.writeFileSync(logFile, "", "utf8");
}

module.exports = { log, logError, clearLogs };
