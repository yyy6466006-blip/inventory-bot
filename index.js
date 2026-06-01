const express = require('express');
const line = require('@line/bot-sdk');
const { google } = require('googleapis');

const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

const SHEET_ID = '10Bl39kXwP9liGhymCXwzfxJMd_hIGbiadMzsn8gO1J0';
const SHEET_NAME = '工作表1';

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function appendRow(values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:G`,
    valueInputOption: 'RAW',
    resource: { values: [values] },
  });
}

async function getRows() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:G`,
  });
  return res.data.values || [];
}

const app = express();

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => { console.error(err); res.status(500).end(); });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  const text = event.message.text.trim();
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  let reply = '';

  try {
    if (text.startsWith('入庫')) {
      const parts = text.split(' ');
      if (parts.length < 3) {
        reply = '❌ 格式錯誤！\n入庫 品名 數量 效期\n例：入庫 玫瑰手霜 10 2026/12';
      } else {
        const [, name, qty, exp = '無'] = parts;
        await appendRow([now, '入庫', name, qty, exp, '', '']);
        reply = `✅ 入庫完成！\n品名：${name}\n數量：${qty}\n效期：${exp}`;
      }

    } else if (text.startsWith('出庫')) {
      const parts = text.split(' ');
      if (parts.length < 3) {
        reply = '❌ 格式錯誤！\n出庫 品名 數量\n例：出庫 玫瑰手霜 3';
      } else {
        const [, name, qty] = parts;
        await appendRow([now, '出庫', name, qty, '', '', '']);
        reply = `✅ 出庫完成！\n品名：${name}\n數量：${qty}`;
      }

    } else if (text === '庫存總覽') {
      const rows = await getRows();
      const inventory = {};
      rows.slice(1).forEach(row => {
        const type = row[1], name = row[2], qty = parseInt(row[3]) || 0;
        if (!inventory[name]) inventory[name] = 0;
        if (type === '入庫') inventory[name] += qty;
        if (type === '出庫') inventory[name] -= qty;
      });
      const lines = Object.entries(inventory).map(([name, qty]) => `${name}：${qty}`);
      reply = lines.length ? `📦 庫存總覽\n${lines.join('\n')}` : '目前沒有庫存資料';

    } else if (text.startsWith('庫存')) {
      const name = text.replace('庫存', '').trim();
      if (!name) {
        reply = '請輸入品名，例：庫存 玫瑰手霜';
      } else {
        const rows = await getRows();
        let total = 0;
        rows.slice(1).forEach(row => {
          if (row[2] === name) {
            const qty = parseInt(row[3]) || 0;
            if (row[1] === '入庫') total += qty;
            if (row[1] === '出庫') total -= qty;
          }
        });
        reply = `📦 ${name}\n目前庫存：${total}`;
      }

    } else if (text === '今日出庫') {
      const rows = await getRows();
      const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
      const todayRows = rows.slice(1).filter(row => row[0] && row[0].includes(today) && row[1] === '出庫');
      if (todayRows.length === 0) {
        reply = '今日尚無出庫記錄';
      } else {
        const lines = todayRows.map(row => `${row[2]}：${row[3]}`);
        reply = `📤 今日出庫\n${lines.join('\n')}`;
      }

    } else if (text === '低庫存') {
      const rows = await getRows();
      const inventory = {};
      rows.slice(1).forEach(row => {
        const type = row[1], name = row[2], qty = parseInt(row[3]) || 0;
        if (!inventory[name]) inventory[name] = 0;
        if (type === '入庫') inventory[name] += qty;
        if (type === '出庫') inventory[name] -= qty;
      });
      const low = Object.entries(inventory).filter(([, qty]) => qty <= 5);
      reply = low.length ? `⚠️ 低庫存商品\n${low.map(([n, q]) => `${n}：${q}`).join('\n')}` : '✅ 所有商品庫存充足';

    } else if (text === '效期檢查') {
      const rows = await getRows();
      const expiryMap = {};
      rows.slice(1).forEach(row => {
        if (row[1] === '入庫' && row[4] && row[4] !== '無') {
          expiryMap[row[2]] = row[4];
        }
      });
      const lines = Object.entries(expiryMap).map(([name, exp]) => `${name}：${exp}`);
      reply = lines.length ? `📅 效期一覽\n${lines.join('\n')}` : '尚無效期資料';

    } else {
      reply = '📋 可用指令：\n\n入庫 品名 數量 效期\n出庫 品名 數量\n庫存 品名\n庫存總覽\n今日出庫\n低庫存\n效期檢查';
    }

  } catch (err) {
    console.error(err);
    reply = '❌ 發生錯誤，請稍後再試';
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: reply }],
  });
}

app.get('/', (req, res) => res.send('庫存管理 Bot 運作中！'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
