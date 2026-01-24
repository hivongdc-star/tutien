// commands/shop.js
const { ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require("discord.js");
const { listItems, buyItem } = require("../shop/shopUtils");

module.exports = {
  name:"shop",
  run: async (client,msg)=>{
    const catalog = listItems(); const entries = Object.entries(catalog);
    const options = entries.slice(0,25).map(([id,it])=>({
      label:`${it.emoji||""} ${it.name}`.trim().slice(0,100),
      value:id,
      description:`${it.price||0} LT • ${it.type}`.slice(0,100)
    }));
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`shop_${msg.author.id}`).setPlaceholder("Chọn vật phẩm để mua...").addOptions(options));
    const sent = await msg.reply({ content:"🛒 **Shop** — chọn vật phẩm để mua.", components:[row] });

    const col = sent.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time:60_000 });
    col.on("collect", async i=>{
      if (i.user.id!==msg.author.id) return i.reply({ content:"❌ Không phải menu của bạn.", ephemeral:true });
      await i.deferUpdate();
      const itemId = i.values[0];
      const res = buyItem(msg.author.id, itemId); // Không yêu cầu RELA khi mua nhẫn
      await sent.edit({ content: res.message, components:[] }).catch(()=>{});
    });
    col.on("end", ()=> sent.edit({ components:[] }).catch(()=>{}));
  }
};
