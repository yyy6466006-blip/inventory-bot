const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const app = express();

const config = {
  channelSecret: '1a0ada3c843c2d84f86dabaf440c1351',
  channelAccessToken: 'UQz8/pVIDyYbYxIgsQdYVLTOLaCzO+oPNm1OmSf7Gid5IpAauMIhPa6V8FlhXBNzbZf7kBRGMVBUyTbaY3KWMdMvNzb65jxy9HAED8bsBEWlU9BfLV1BWo72bRPcVj80ov0h2zc8hQziXYYkhAsf/QdB04t89/1O/w1cDnyilFU='
};

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzOCTfFAgDBrQLFCPkR65E6Kj7SMKoQcaeMuQbGEiADCFHZz0VgNDZ0kXJUguEJFOfD/exec';

const client = new line.Client(config);

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error(err);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('庫存管理 Bot 運作中 ✅'));

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const msg = event.message.text.trim();
  let reply = '';

  try {
    if (msg === '庫存' || msg === '庫存總覽' || msg === '查詢') {
      const res = await axios.get(GAS_URL, { params: { action: 'getStock' } });
      const { items } = res.data;
      if (!items || items.length === 0) {
        reply = '📦 目前庫存是空的';
      } else {
        reply = '📦 庫存總覽\n─────────────\n';
        items.forEach(item => {
          const emoji = item.stock <= 0 ? '🔴' : item.stock <= item.safeStock ? '🟡' : '🟢';
          const expiry = item.expiry ? `  效期:${item.expiry}` : '';
          reply += `${emoji} ${item.name}：${item.stock} ${item.unit || '個'}${expiry}\n`;
        });
        reply += `─────────────\n共 ${items.length} 項商品`;
      }

    } else if (msg === '低庫存' || msg === '庫存警示') {
      const res = await axios.get(GAS_URL, { params: { action: 'getLowStock' } });
      const { items } = res.data;
      if (!items || items.length === 0) {
        reply = '✅ 目前沒有低庫存商品！';
      } else {
        reply = '⚠️ 低庫存警示\n─────────────\n';
        items.forEach(item => {
          const emoji = item.stock <= 0 ? '🔴' : '🟡';
          reply += `${emoji} ${item.name}：剩 ${item.stock} ${item.unit || '個'}（安全庫存：${item.safeStock}）\n`;
        });
        reply += '─────────────\n請盡快補貨！';
      }

    } else if (msg === '今日出庫' || msg === '今天出庫') {
      const res = await axios.get(GAS_URL, { params: { action: 'getTodayOut' } });
      const { items, date } = res.data;
      if (!items || items.length === 0) {
        reply = `📤 ${date} 今日尚無出庫記錄`;
      } else {
        reply = `📤 ${date} 今日出庫\n─────────────\n`;
        items.forEach(item => {
          reply += `${item.time} ${item.name} x${item.qty}`;
          if (item.operator) reply += ` (${item.operator})`;
          reply += '\n';
        });
        const total = items.reduce((sum, i) => sum + Number(i.qty), 0);
        reply += `─────────────\n共 ${items.length} 筆，合計 ${total} 個`;
      }

    } else if (msg.startsWith('入庫 ')) {
      const parts = msg.slice(3).trim().split(' ');
      if (parts.length < 2 || isNaN(parts[1])) {
        reply = '❌ 格式錯誤\n入庫 品名 數量 [效期] [操作人]\n例：入庫 蘋果汁 20 2025/12/31 小美';
      } else {
        const name = parts[0];
        const qty = parseInt(parts[1]);
        const expiry = parts[2] || '';
        const operator = parts[3] || '';
        const res = await axios.post(GAS_URL, { action: 'stockIn', name, qty, expiry, operator });
        const data = res.data;
        if (data.error) {
          reply = `❌ ${data.error}`;
        } else {
          reply = `📥 入庫成功！\n品名：${data.name}\n入庫數量：${data.qty} 個\n目前庫存：${data.stock} 個`;
          if (expiry) reply += `\n效期：${expiry}`;
          if (operator) reply += `\n操作人：${operator}`;
        }
      }

    } else if (msg.startsWith('出庫 ')) {
      const parts = msg.slice(3).trim().split(' ');
      if (parts.length < 2 || isNaN(parts[1])) {
        reply = '❌ 格式錯誤\n出庫 品名 數量 [效期] [操作人]\n例：出庫 蘋果汁 5 2025/12/31 小美';
      } else {
        const name = parts[0];
        const qty = parseInt(parts[1]);
        const expiry = parts[2] || '';
        const operator = parts[3] || '';
        const res = await axios.post(GAS_URL, { action: 'stockOut', name, qty, expiry, operator });
        const data = res.data;
        if (data.error) {
          reply = `❌ ${data.error}`;
        } else {
          reply = `📤 出庫成功！\n品名：${data.name}\n出庫數量：${data.qty} 個\n目前庫存：${data.stock} 個`;
          if (expiry) reply += `\n效期：${expiry}`;
          if (operator) reply += `\n操作人：${operator}`;
        }
      }

    } else if (msg.startsWith('盤點 ')) {
      const parts = msg.slice(3).trim().split(' ');
      if (parts.length < 2 || isNaN(parts[1])) {
        reply = '❌ 格式錯誤\n盤點 品名 實際數量 [操作人]\n例：盤點 蘋果汁 18 小美';
      } else {
        const name = parts[0];
        const actualQty = parseInt(parts[1]);
        const operator = parts[2] || '';
        const res = await axios.post(GAS_URL, { action: 'inventory', name, actualQty, operator });
        const data = res.data;
        if (data.error) {
          reply = `❌ ${data.error}`;
        } else {
          const diffText = data.diff > 0 ? `多 ${data.diff}` : data.diff < 0 ? `少 ${Math.abs(data.diff)}` : '數量正確';
          const diffEmoji = data.diff === 0 ? '✅' : '⚠️';
          reply = `${diffEmoji} 盤點完成！\n品名：${data.name}\n系統庫存：${data.original} 個\n實際庫存：${data.actual} 個\n差異：${diffText}`;
          if (operator) reply += `\n操作人：${operator}`;
        }
      }

    } else if (msg === '說明' || msg === 'help' || msg === '幫助') {
      reply = `📋 指令說明
─────────────
📦 庫存  →  查看全部庫存
⚠️ 低庫存  →  庫存警示
📤 今日出庫  →  今天出庫明細

📥 入庫 品名 數量 效期 操作人
📤 出庫 品名 數量 效期 操作人
🔍 盤點 品名 實際數量 操作人

效期和操作人可省略
─────────────
🟢充足 🟡偏少 🔴缺貨`;

    } else {
      reply = '❓ 看不懂這個指令\n傳「說明」查看所有指令';
    }

  } catch (err) {
    console.error('錯誤:', err);
    reply = '⚠️ 系統發生錯誤，請稍後再試';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: reply
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot 已啟動，Port: ${PORT}`));
