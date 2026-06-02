const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const app = express();

const config = {
  channelSecret: '1a0ada3c843c2d84f86dabaf440c1351',
  channelAccessToken: 'UQz8/pVIDyYbYxIgsQdYVLTOLaCzO+oPNm1OmSf7Gid5IpAauMIhPa6V8FlhXBNzbZf7kBRGMVBUyTbaY3KWMdMvNzb65jxy9HAED8bsBEWlU9BfLV1BWo72bRPcVj80ov0h2zc8hQziXYYkhAsf/QdB04t89/1O/w1cDnyilFU='
};

// Google Apps Script 網址
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzOCTfFAgDBrQLFCPkR65E6Kj7SMKoQcaeMuQbGEiADCFHZz0VgNDZ0kXJUguEJFOfD/exec';

const client = new line.Client(config);

// Webhook endpoint
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error(err);
      res.status(500).end();
    });
});

// 健康檢查
app.get('/', (req, res) => res.send('庫存管理 Bot 運作中 ✅'));

// 主要事件處理
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userMsg = event.message.text.trim();
  let replyText = '';

  try {
    // 指令解析
    if (userMsg === '查詢' || userMsg === '庫存' || userMsg === '查庫存') {
      replyText = await queryAll();

    } else if (userMsg.startsWith('查 ')) {
      const itemName = userMsg.slice(2).trim();
      replyText = await queryItem(itemName);

    } else if (userMsg.startsWith('入庫 ')) {
      // 格式：入庫 商品名稱 數量
      const parts = userMsg.slice(3).trim().split(' ');
      if (parts.length < 2 || isNaN(parts[parts.length - 1])) {
        replyText = '❌ 格式錯誤\n正確格式：入庫 商品名稱 數量\n例如：入庫 蘋果 50';
      } else {
        const qty = parseInt(parts[parts.length - 1]);
        const name = parts.slice(0, -1).join(' ');
        replyText = await updateStock(name, qty, '入庫');
      }

    } else if (userMsg.startsWith('出庫 ')) {
      // 格式：出庫 商品名稱 數量
      const parts = userMsg.slice(3).trim().split(' ');
      if (parts.length < 2 || isNaN(parts[parts.length - 1])) {
        replyText = '❌ 格式錯誤\n正確格式：出庫 商品名稱 數量\n例如：出庫 蘋果 10';
      } else {
        const qty = parseInt(parts[parts.length - 1]);
        const name = parts.slice(0, -1).join(' ');
        replyText = await updateStock(name, qty, '出庫');
      }

    } else if (userMsg.startsWith('新增 ')) {
      // 格式：新增 商品名稱 初始數量
      const parts = userMsg.slice(3).trim().split(' ');
      if (parts.length < 2 || isNaN(parts[parts.length - 1])) {
        replyText = '❌ 格式錯誤\n正確格式：新增 商品名稱 初始數量\n例如：新增 香蕉 100';
      } else {
        const qty = parseInt(parts[parts.length - 1]);
        const name = parts.slice(0, -1).join(' ');
        replyText = await addItem(name, qty);
      }

    } else if (userMsg === '說明' || userMsg === 'help' || userMsg === '幫助') {
      replyText = getHelp();

    } else {
      replyText = '❓ 看不懂這個指令\n\n傳送「說明」查看所有指令';
    }

  } catch (err) {
    console.error('處理指令錯誤:', err);
    replyText = '⚠️ 系統發生錯誤，請稍後再試';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  });
}

// ===== Google Apps Script 呼叫函式 =====

// 查詢所有庫存
async function queryAll() {
  const res = await axios.get(GAS_URL, { params: { action: 'getAll' } });
  const data = res.data;

  if (!data || data.length === 0) return '📦 目前庫存是空的';

  let msg = '📦 目前庫存：\n';
  msg += '─────────────\n';
  data.forEach(row => {
    const stock = row.stock;
    const emoji = stock <= 0 ? '🔴' : stock <= 10 ? '🟡' : '🟢';
    msg += `${emoji} ${row.name}：${stock} ${row.unit || '個'}\n`;
  });
  msg += '─────────────\n';
  msg += `共 ${data.length} 項商品`;
  return msg;
}

// 查詢單一商品
async function queryItem(name) {
  const res = await axios.get(GAS_URL, { params: { action: 'getItem', name } });
  const data = res.data;

  if (!data || data.error) return `❌ 找不到「${name}」`;

  const emoji = data.stock <= 0 ? '🔴' : data.stock <= 10 ? '🟡' : '🟢';
  return `${emoji} 商品：${data.name}\n數量：${data.stock} ${data.unit || '個'}`;
}

// 入庫 / 出庫
async function updateStock(name, qty, type) {
  const action = type === '入庫' ? 'addStock' : 'removeStock';
  const res = await axios.post(GAS_URL, { action, name, qty });
  const data = res.data;

  if (data.error) return `❌ ${data.error}`;

  const emoji = type === '入庫' ? '📥' : '📤';
  return `${emoji} ${type}成功！\n商品：${data.name}\n${type}數量：${qty}\n目前庫存：${data.stock} ${data.unit || '個'}`;
}

// 新增商品
async function addItem(name, initialStock) {
  const res = await axios.post(GAS_URL, { action: 'addItem', name, qty: initialStock });
  const data = res.data;

  if (data.error) return `❌ ${data.error}`;

  return `✅ 新增成功！\n商品：${name}\n初始庫存：${initialStock} 個`;
}

// 說明文字
function getHelp() {
  return `📋 庫存管理指令說明
─────────────
🔍 查詢庫存
  查詢（查看全部）
  查 商品名稱

📥 入庫
  入庫 商品名稱 數量
  例：入庫 蘋果 50

📤 出庫
  出庫 商品名稱 數量
  例：出庫 蘋果 10

➕ 新增商品
  新增 商品名稱 初始數量
  例：新增 香蕉 100
─────────────
🟢 充足  🟡 偏少(≤10)  🔴 缺貨`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot 已啟動，Port: ${PORT}`));
