const dateSelect = document.getElementById('dateSelect');
const liveBadge = document.getElementById('live');
const COLS = ['学校所在地', '学校区分', 'その他'];

let lastCount = 0;

function todayStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadDates() {
    const dates = await fetch('/api/logs/dates').then((r) => r.json()).catch(() => []);
    const today = todayStr();
    if (!dates.includes(today)) dates.unshift(today);
    const selected = dateSelect.value || today;
    dateSelect.replaceChildren(...dates.map((d) => {
        const o = document.createElement('option');
        o.value = d;
        o.textContent = d === today ? `${d}（今日）` : d;
        return o;
    }));
    dateSelect.value = dates.includes(selected) ? selected : today;
}

function isToday() { return dateSelect.value === todayStr(); }

async function getLogs() {
    const rows = await fetch(`/api/logs?date=${encodeURIComponent(dateSelect.value)}`)
        .then((r) => r.json()).catch(() => []);
    render(rows);
}

function render(rows) {
    document.getElementById('total').textContent = rows.length;
    document.getElementById('empty').hidden = rows.length > 0;
    liveBadge.hidden = !isToday();

    const body = document.getElementById('logsBody');
    const fresh = isToday() && lastCount > 0 ? rows.length - lastCount : 0;
    body.replaceChildren(...rows.map((row, i) => {
        const tr = document.createElement('tr');
        if (fresh > 0 && i >= rows.length - fresh) tr.className = 'new';
        const num = document.createElement('td');
        num.textContent = i + 1;
        tr.append(num);
        COLS.forEach((c) => {
            const td = document.createElement('td');
            td.textContent = row[c] || '';
            tr.append(td);
        });
        return tr;
    }).reverse());
    lastCount = rows.length;

    renderBars('byClass', rows.map((r) => r['学校区分'] || '(未記入)'));
    renderBars('byPlace', rows.map((r) => r['学校所在地'] || '(未記入)'));
}

function renderBars(id, values) {
    const counts = new Map();
    values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    const max = sorted.length ? sorted[0][1] : 1;
    document.getElementById(id).replaceChildren(...sorted.map(([name, n]) => {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'name';
        label.textContent = name;
        label.title = name;
        const track = document.createElement('span');
        track.className = 'track';
        const fill = document.createElement('span');
        fill.className = 'fill';
        fill.style.display = 'block';
        fill.style.width = `${(n / max) * 100}%`;
        track.append(fill);
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = n;
        li.append(label, track, count);
        return li;
    }));
}

// 新しい記録が来たら自動更新(切断されたら再接続)
function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${location.host}`);
    socket.onmessage = async (e) => {
        if (e.data !== 'Update') return;
        await loadDates();
        if (isToday()) getLogs();
    };
    socket.onclose = () => setTimeout(connect, 3000);
}

dateSelect.addEventListener('change', () => { lastCount = 0; getLogs(); });

(async () => {
    await loadDates();
    await getLogs();
    connect();
})();
