const fs = require("fs");
const path = require("path");

module.exports = {
  name: "reload",
  run: (client, msg, args) => {
    if (msg.author.id !== process.env.OWNER_ID) {
      return msg.channel.send("❌ Bạn không có quyền dùng lệnh này.");
    }

    if (!args[0]) return msg.channel.send("❌ Hãy nhập tên lệnh hoặc `all`.");

    if (args[0] === "all") {
      client.commands.clear();
      const commandsPath = path.join(__dirname);
      const files = fs
        .readdirSync(commandsPath)
        .filter((f) => f.endsWith(".js"));

      for (const file of files) {
        delete require.cache[require.resolve(path.join(commandsPath, file))];
        const cmd = require(path.join(commandsPath, file));
        client.commands.set(cmd.name, cmd);
      }

      return msg.channel.send("✅ Reload tất cả lệnh thành công.");
    }

    const cmdName = args[0].toLowerCase();
    const filePath = path.join(__dirname, `${cmdName}.js`);

    if (!fs.existsSync(filePath))
      return msg.channel.send("❌ Không tìm thấy file lệnh.");

    delete require.cache[require.resolve(filePath)];
    const cmd = require(filePath);
    client.commands.set(cmd.name, cmd);

    msg.channel.send(`✅ Reload lệnh \`${cmdName}\` thành công.`);
  },
};
