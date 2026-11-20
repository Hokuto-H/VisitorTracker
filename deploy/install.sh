#!/usr/bin/env bash
# Visitor Tracker を systemd サービスとして登録し、起動時に自動で立ち上がるようにする
# 使い方: sudo bash deploy/install.sh
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
APP_USER="${SUDO_USER:-$(id -un)}"
PORT="${PORT:-3000}"
NODE_BIN="$(command -v node)"

if [ "$(id -u)" -ne 0 ]; then
    echo "sudo で実行してください: sudo bash deploy/install.sh" >&2
    exit 1
fi

echo "==> 依存パッケージをインストール"
sudo -u "$APP_USER" npm install --omit=dev

echo "==> systemd サービスを登録 (user=$APP_USER, dir=$APP_DIR, port=$PORT)"
sed -e "s#^User=.*#User=$APP_USER#" \
    -e "s#^WorkingDirectory=.*#WorkingDirectory=$APP_DIR#" \
    -e "s#^Environment=PORT=.*#Environment=PORT=$PORT#" \
    -e "s#^ExecStart=.*#ExecStart=$NODE_BIN $APP_DIR/index.js#" \
    deploy/visitor-tracker.service > /etc/systemd/system/visitor-tracker.service

systemctl daemon-reload
systemctl enable --now visitor-tracker
systemctl restart visitor-tracker

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    echo "==> ファイアウォールで $PORT/tcp を許可"
    ufw allow "$PORT/tcp"
fi

sleep 1
systemctl --no-pager --lines=5 status visitor-tracker || true
echo
echo "公開URL:"
for ip in $(hostname -I); do
    case "$ip" in *:*) ;; *) echo "  http://$ip:$PORT/        (来場者用)"; echo "  http://$ip:$PORT/logs    (ログ確認)";; esac
done
