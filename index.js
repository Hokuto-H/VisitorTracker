const express = require('express');
const http = require('http');
const ws = require('ws');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// ログはWeb公開されない場所(プロジェクト直下の logs/)に日付ごとのCSVで保存する
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');
const PORT = process.env.PORT || 3000;
const HEADER = '学校所在地,学校区分,その他\n';

function todayLogPath() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return path.join(LOG_DIR, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`);
}

function csvField(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const app = express();
const server = http.createServer(app);
const wss = new ws.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/logs', (req, res) => {
    res.sendFile(__dirname + '/public/logs_table.html');
});

// 保存済みログの日付一覧(新しい順)
app.get('/api/logs/dates', (req, res) => {
    let files = [];
    try {
        files = fs.readdirSync(LOG_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f));
    } catch (e) { /* ログフォルダがまだない */ }
    res.json(files.map((f) => f.slice(0, 10)).sort().reverse());
});

// 指定日のログ(?date=YYYY-MM-DD、省略時は今日)
app.get('/api/logs', (req, res) => {
    const date = req.query.date;
    let file = todayLogPath();
    if (date !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json([]);
        file = path.join(LOG_DIR, `${date}.csv`);
    }
    if (!fs.existsSync(file)) return res.json([]);
    const results = [];
    fs.createReadStream(file)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => res.json(results))
        .on('error', () => res.status(500).json([]));
});

app.post('/logs', (req, res) => {
    //サイトを作成する際にpostリクエストをfetchで投げて、それをここで受け取り、返すための処理
    const results = [];
    const file = todayLogPath();
    if(!fs.existsSync(file)){
        res.send(results);
        return;
    }
    fs.createReadStream(file)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            res.send(results);
        });
});

app.post('/append-file', (req, res) => {
    const content = req.body || {};
    const file = todayLogPath();
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const isNewFile = !fs.existsSync(file);
    const row = [content.prefecture, content.classification, content.university].map(csvField).join(',') + '\n';

    fs.appendFile(file, (isNewFile ? HEADER : '') + row, 'utf8', (err) => {
        if(err) {
            console.log(err);
            res.status(500).send('Error');
            return;
        }
        wss.clients.forEach((client) => {
            client.send('Update');
        });
        res.send('Saved');
    });
});

wss.on('connection', (ws) => {
    console.log('Connected');

    ws.on('close', () => {
        console.log('Disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Logs are saved in ${LOG_DIR}`);
});