"""Supervise a verified private SSH tunnel and configure local app endpoints.

macOS: python3 scripts/connect_gpu.py (after setup_gpu.py).
No secrets are printed. Restart the app after updating its environment.
"""
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.cache/tryon-3d/gpu'


def app_environment(existing, token, expiry):
    values = {'TRYON_PROVIDER': 'fashn_local', 'FASHN_LOCAL_URL': 'http://host.docker.internal:3214',
              'FASHN_LOCAL_TOKEN': token, 'POSE_PROVIDER': 'flux_local',
              'POSE_LOCAL_URL': 'http://host.docker.internal:3214', 'POSE_LOCAL_TOKEN': token,
              'GPU_EXPIRES_AT': expiry}
    lines = [line for line in existing.splitlines() if line.split('=', 1)[0].strip().removeprefix('export ').strip() not in values]
    return '\n'.join(lines + [f'{key}={value}' for key, value in values.items()]) + '\n'


def main():
    shared = '--shared' in sys.argv
    lease = json.loads((STATE / ('shared.json' if shared else 'lease.json')).read_text())
    if (not lease.get('schedule_verified') and not (shared and lease.get('shared'))) or not lease.get('ssh_host_fingerprint'):
        raise RuntimeError('Verify the lease termination and SSH host before connecting')
    label = 'com.dti2irl.gpu.' + lease['lease']
    arguments = ['/usr/bin/ssh', '-N', '-i', lease.get('key_file', str(STATE / 'id_ed25519')), '-o', 'IdentitiesOnly=yes',
                 '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={STATE / "known_hosts"}',
                 '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3',
                 '-L', '127.0.0.1:3214:127.0.0.1:8080', 'ubuntu@' + lease['public_ip']]
    path = STATE / 'tunnel.plist'
    path.write_bytes(plistlib.dumps({'Label': label, 'ProgramArguments': arguments, 'RunAtLoad': True,
                                    'KeepAlive': True, 'ThrottleInterval': 15,
                                    'StandardErrorPath': str(STATE / 'tunnel.log')}))
    path.chmod(0o600)
    domain = f'gui/{os.getuid()}'
    loaded = subprocess.run(['launchctl', 'print', domain + '/' + label], capture_output=True)
    if loaded.returncode == 0:
        subprocess.run(['launchctl', 'bootout', domain + '/' + label], check=True)
    subprocess.run(['launchctl', 'bootstrap', domain, str(path)], check=True)
    token = next(line.split('=', 1)[1] for line in (STATE / 'worker.env').read_text().splitlines() if line.startswith('FASHN_WORKER_TOKEN='))
    env = ROOT / '.env.local'
    env.write_text(app_environment(env.read_text() if env.exists() else '', token, lease['expires_at']))
    env.chmod(0o600)
    print('Supervised SSH tunnel configured on loopback port 3214; local app environment updated without printing tokens.')


if __name__ == '__main__':
    main()
