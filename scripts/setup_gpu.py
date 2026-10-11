"""Verify the new GPU SSH host against its AWS console, then install the worker.

Requires a successful scripts/aws_gpu.py lease manifest. Does not print tokens.
"""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import sys

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.cache/tryon-3d/gpu'


def main():
    shared = '--shared' in sys.argv
    manifest = STATE / ('shared.json' if shared else 'lease.json')
    lease = json.loads(manifest.read_text())
    if not lease.get('schedule_verified') and not (shared and lease.get('shared') and lease.get('expires_at')):
        raise RuntimeError('A verified termination schedule is required before setup')
    instance, ip = lease['instance_id'], lease['public_ip']
    known = STATE / 'known_hosts'
    verified = False
    for attempt in range(3 if shared else 30):
        scanned = subprocess.run(['ssh-keyscan', '-T', '5', '-t', 'ed25519', ip], capture_output=True, text=True)
        if not scanned.stdout.strip():
            time.sleep(2)
            continue
        candidate = STATE / 'host_candidate'
        candidate.write_text(scanned.stdout)
        fingerprint = subprocess.check_output(['ssh-keygen', '-l', '-E', 'sha256', '-f', str(candidate)], text=True).split()[1]
        if shared:
            if fingerprint != lease.get('ssh_host_fingerprint'):
                raise RuntimeError('Shared GPU SSH host does not match its previously trusted fingerprint; no credentials sent')
            known.write_text(scanned.stdout)
            known.chmod(0o600)
            verified = True
            break
        console = subprocess.check_output(['aws', '--profile', lease['profile'], '--region', lease['region'], 'ec2', 'get-console-output', '--instance-id', instance, '--latest', '--output', 'json', '--no-cli-pager'], text=True)
        output = json.loads(console).get('Output', '')
        if fingerprint not in output:
            try:
                output = base64.b64decode(output).decode('utf8', errors='replace')
            except Exception:
                pass
        if fingerprint in output:
            known.write_text(scanned.stdout)
            known.chmod(0o600)
            lease['ssh_host_fingerprint'] = fingerprint
            manifest.write_text(json.dumps(lease, indent=2) + '\n')
            verified = True
            break
        time.sleep(2)
    if not verified:
        raise RuntimeError('SSH host fingerprint was not verified against the AWS console; no credentials sent')
    options = ['-i', lease.get('key_file', str(STATE / 'id_ed25519')), '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={known}', '-o', 'ConnectTimeout=10']
    remote = 'ubuntu@' + ip
    subprocess.run(['ssh', *options, remote, 'mkdir -p /home/ubuntu/dti2irl-worker && chmod 700 /home/ubuntu/dti2irl-worker'], check=True)
    env = STATE / 'worker.env'
    existing_env = dict(line.split('=', 1) for line in env.read_text().splitlines() if '=' in line) if env.exists() else {}
    if not existing_env.get('FASHN_WORKER_TOKEN') or existing_env.get('GPU_EXPIRES_AT') != lease['expires_at']:
        env.write_text('FASHN_WORKER_TOKEN=' + secrets.token_urlsafe(48) + '\nFASHN_WEIGHTS_DIR=/home/ubuntu/dti2irl-worker/weights\nPOSE_WEIGHTS_DIR=/home/ubuntu/dti2irl-worker/pose-weights\nHF_HUB_DISABLE_TELEMETRY=1\nGPU_EXPIRES_AT=' + lease['expires_at'] + '\n')
        env.chmod(0o600)
    files = [str(ROOT / 'workers/fashn-local' / name) for name in ('app.py', 'prepare.py', 'requirements.txt', 'setup.sh')]
    subprocess.run(['scp', *options, *files, remote + ':/home/ubuntu/dti2irl-worker/'], check=True)
    subprocess.run(['scp', *options, str(env), remote + ':/home/ubuntu/dti2irl-worker/.env'], check=True)
    subprocess.run(['ssh', *options, remote, 'chmod 600 /home/ubuntu/dti2irl-worker/.env; cd /home/ubuntu/dti2irl-worker && nohup bash setup.sh > setup.log 2>&1 < /dev/null &'], check=True)
    subprocess.run(['python3', str(ROOT / 'scripts/connect_gpu.py'), *(['--shared'] if shared else [])], check=True)
    print(f'Host verified; GPU worker setup started on {instance}. Log: /home/ubuntu/dti2irl-worker/setup.log')


if __name__ == '__main__':
    main()
