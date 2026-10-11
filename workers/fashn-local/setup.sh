#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/dti2irl-worker
set -a
source .env
set +a
# This timer stops only our worker; a borrowed instance and its services stay up.
GPU_STOP_TIME=$(date -u -d "$GPU_EXPIRES_AT" '+%Y-%m-%d %H:%M:%S UTC')
sudo tee /etc/systemd/system/dti2irl-worker-expiry.service >/dev/null <<'SERVICE'
[Unit]
Description=Stop the expired DTI2IRL inference worker
[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl stop dti2irl-worker.service
SERVICE
sudo tee /etc/systemd/system/dti2irl-worker-expiry.timer >/dev/null <<TIMER
[Unit]
Description=24-hour DTI2IRL worker expiry
[Timer]
OnCalendar=$GPU_STOP_TIME
Persistent=true
AccuracySec=1s
[Install]
WantedBy=timers.target
TIMER
sudo systemctl daemon-reload
sudo systemctl enable --now dti2irl-worker-expiry.timer
# uv supplies Python 3.11 independently of the AMI's system Python version.
mkdir -p bootstrap/bin
curl --proto '=https' --tlsv1.2 -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR="$PWD/bootstrap/bin" UV_NO_MODIFY_PATH=1 sh
bootstrap/bin/uv venv --python 3.11 venv
bootstrap/bin/uv pip install --python venv/bin/python torch torchvision --index-url https://download.pytorch.org/whl/cu128
FASHN_SOURCE_COMMIT=7c0f10af3f91ad4048fe9729c470a13ef905d25a
if [ ! -d upstream/.git ]; then git clone https://github.com/fashn-AI/fashn-vton-1.5.git upstream; fi
git -C upstream checkout --detach "$FASHN_SOURCE_COMMIT"
git -C upstream rev-parse HEAD > upstream-commit.txt
bootstrap/bin/uv pip install --python venv/bin/python -e upstream -r requirements.txt
bootstrap/bin/uv pip freeze --python venv/bin/python > installed-requirements.txt
set -a
source .env
set +a
venv/bin/python prepare.py
sudo tee /etc/systemd/system/dti2irl-worker.service >/dev/null <<'SERVICE'
[Unit]
Description=DTI2IRL private single-GPU inference worker
After=network-online.target
Wants=network-online.target
[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/dti2irl-worker
EnvironmentFile=/home/ubuntu/dti2irl-worker/.env
ExecCondition=/home/ubuntu/dti2irl-worker/venv/bin/python -c "import os;from datetime import datetime,timezone;exit(0 if datetime.now(timezone.utc)<datetime.fromisoformat(os.environ['GPU_EXPIRES_AT'].replace('Z','+00:00')) else 1)"
ExecStart=/home/ubuntu/dti2irl-worker/venv/bin/uvicorn app:app --host 127.0.0.1 --port 8080 --workers 1 --no-access-log
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
[Install]
WantedBy=multi-user.target
SERVICE
sudo systemctl daemon-reload
if [ "$(date -u +%s)" -ge "$(date -u -d "$GPU_EXPIRES_AT" +%s)" ]; then
  echo 'Lease expired during installation; worker left stopped'
  exit 0
fi
sudo systemctl enable dti2irl-worker
sudo systemctl restart dti2irl-worker
echo 'Worker installed; loopback-only port 8080'
