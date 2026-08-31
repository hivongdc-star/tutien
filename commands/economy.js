const { EmbedBuilder } = require("discord.js");
const { getUser, loadUsers, saveUsers } = require("../utils/storage");
const { dailyReward, maxDailyChatStones } = require("../utils/config");

// ==================================================
// CURRENCY ENGINE
// ==================================================
const chatTracker = {};
function addLT(userId,amount){const users=loadUsers();if(!users[userId])return;users[userId].lt=(Number(users[userId].lt)||0)+(Number(amount)||0);saveUsers(users);}
function removeLT(userId,amount){const users=loadUsers();if(!users[userId])return;users[userId].lt=Math.max(0,(Number(users[userId].lt)||0)-(Number(amount)||0));saveUsers(users);}
function getLT(userId){return Number(loadUsers()[userId]?.lt)||0;}
function earnFromChat(userId){const today=new Date().toDateString();if(!chatTracker[userId]||chatTracker[userId].date!==today)chatTracker[userId]={date:today,earned:0};if(chatTracker[userId].earned<maxDailyChatStones){addLT(userId,1);chatTracker[userId].earned++;}}
function claimDaily(userId){const users=loadUsers(),u=users[userId];if(!u)return{success:false,message:"Đạo hữu chưa nhập đạo."};const today=new Date().toDateString();if(u.lastDaily===today)return{success:false,message:"❌ Hôm nay đạo hữu đã nhận bổng lộc rồi."};u.lastDaily=today;u.dailyStreak=(u.dailyStreak||0)+1;const reward=dailyReward+(u.dailyStreak-1)*5;u.lt=(Number(u.lt)||0)+reward;users[userId]=u;saveUsers(users);return{success:true,message:`✅ Đạo hữu nhận **${reward}** 💎 Linh thạch. Chuỗi lĩnh bổng: **${u.dailyStreak}** ngày.`};}
function rewardWord(userId,amount=1){addLT(userId,amount);}
function rewardGameResults(players){const results=[];for(const [userId,words] of Object.entries(players||{})){const reward=Number(words)||0;addLT(userId,reward);results.push({userId,reward,words:reward});}return results.sort((a,b)=>b.words-a.words);}
function fmt(n){return Number(n||0).toLocaleString("vi-VN");}

// ==================================================
// COMMANDS
// ==================================================
const daily={name:"daily",aliases:["dly","nhanlt","nhanhang"],description:"Nhận Linh thạch hằng ngày",run:async(_client,msg)=>msg.reply(claimDaily(msg.author.id).message)};
const lt={name:"lt",aliases:["linhthach"],description:"Xem Linh thạch trong linh khố",run:async(_client,msg)=>{const u=getUser(msg.author.id);if(!u)return msg.reply("⚠️ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");return msg.reply(`💎 Linh khố hiện có **${u.lt??0} Linh thạch**.`);}};
const chuyen={
  name:"chuyen",aliases:["give","pay","transfer","chuyenlt"],description:"Chuyển Linh thạch cho đạo hữu khác",usage:"-chuyen @nguoi_nhan <so_luong>",
  run:async(_client,msg,args)=>{
    const mention=msg.mentions.users.first(),senderId=msg.author.id;let targetId=mention?.id||null,amountStr=null;
    if(mention)amountStr=args.find((a)=>/^\d+$/.test(a));else{const idArg=args.find((a)=>/^<@!?(\d+)>$/.test(a));if(idArg){targetId=idArg.replace(/[<@!>]/g,"");amountStr=args.find((a)=>/^\d+$/.test(a));}else if(args.length>=2&&/^\d+$/.test(args[0])){amountStr=args[0];const id2=args.find((a)=>/^<@!?(\d+)>$/.test(a));if(id2)targetId=id2.replace(/[<@!>]/g,"");}}
    if(!targetId||!amountStr)return msg.reply("❌ Cú pháp: `-chuyen @nguoi_nhan <so_luong>` hoặc `-chuyen <so_luong> @nguoi_nhan>`");if(targetId===senderId)return msg.reply("❌ Không thể tự chuyển Linh thạch cho chính mình.");const amount=parseInt(amountStr,10);if(!Number.isFinite(amount)||amount<=0)return msg.reply("❌ Số lượng phải là số nguyên dương.");
    const users=loadUsers();if(!users[senderId])return msg.reply("⚠️ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");if(!users[targetId])return msg.reply("⚠️ Người nhận chưa nhập đạo.");if((Number(users[senderId].lt)||0)<amount)return msg.reply(`❌ Linh thạch không đủ. Hiện có: **${Number(users[senderId].lt)||0}**`);
    users[senderId].lt-=amount;users[targetId].lt=(Number(users[targetId].lt)||0)+amount;saveUsers(users);return msg.reply(`✅ Đã chuyển **${amount}** 💎 Linh thạch cho <@${targetId}>.\n📤 Linh khố của đạo hữu: **${users[senderId].lt}**\n📥 Linh khố người nhận: **${users[targetId].lt}**`);
  }
};
const rank={name:"rank",aliases:["top","bxh"],run:async(_client,msg)=>{const all=Object.values(loadUsers()||{}).filter((u)=>u&&Number.isFinite(Number(u.level))).sort((a,b)=>(Number(b.level)||0)-(Number(a.level)||0)||(Number(b.exp)||0)-(Number(a.exp)||0)).slice(0,10);if(!all.length)return msg.reply("❌ Hiện chưa có ai trên Bảng Phong Vân.");const desc=all.map((u,i)=>`${i+1}. **${u.title?`[${u.title}] `:""}${u.name||"Ẩn danh"}**\n${u.realm||"(chưa rõ)"} • Cấp **${u.level||1}**`).join("\n\n");return msg.reply({embeds:[new EmbedBuilder().setColor(0xF1C40F).setTitle("🏆 Bảng Phong Vân").setDescription(desc)]});}};
const ranklt={name:"ranklt",aliases:["toplt","bxhlt"],run:async(_client,msg)=>{const all=Object.values(loadUsers()||{}).filter(Boolean).sort((a,b)=>(Number(b.lt)||0)-(Number(a.lt)||0)).slice(0,10);if(!all.length)return msg.reply("❌ Hiện chưa có ai trên Bảng Tàng Phú.");const desc=all.map((u,i)=>`${i+1}. **${u.title?`[${u.title}] `:""}${u.name||"Ẩn danh"}**\nLinh thạch: **${fmt(u.lt)}**`).join("\n\n");return msg.reply({embeds:[new EmbedBuilder().setColor(0x00B0F4).setTitle("💎 Bảng Tàng Phú").setDescription(desc)]});}};

module.exports={commands:[daily,lt,chuyen,rank,ranklt],addLT,removeLT,getLT,earnFromChat,claimDaily,rewardWord,rewardGameResults,addStones:addLT};
