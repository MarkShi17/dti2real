# Private FASHN + FLUX GPU worker

This single-process worker runs FASHN VTON 1.5 garment try-on and FLUX.2-klein-4B pose edits. It accepts image bytes, never fetches client-supplied URLs, and does not retain photo files. The application stores normalized uploads and results in private 24-hour sessions. Delete my session removes those files.

1. Provision a dedicated AWS GPU with `python3 scripts/aws_gpu.py provision --profile oasis-prod`. The default is `g6e.2xlarge`; `--instance-type g6e.xlarge` uses the same 48 GB L40S GPU with less CPU/RAM. Use only a type/region authorized for your deployment. Private keys and lease metadata are stored under ignored `.cache/tryon-3d/gpu/`.
2. Run `python3 scripts/setup_gpu.py`. It requires a verified 24-hour termination schedule and verifies the SSH host fingerprint against the AWS console before sending credentials. Installation and explicit model downloads run remotely; inspect `/home/ubuntu/dti2irl-worker/setup.log` through the verified SSH connection.
3. Setup starts a supervised macOS SSH tunnel on local loopback port 3214 and writes the app endpoints, token, and lease expiry to `.env.local` without changing other provider settings. Reconnect with `python3 scripts/connect_gpu.py` if needed. Recreate the application container without deleting its session volume after the worker reports ready.

```dotenv
TRYON_PROVIDER=fashn_local
FASHN_LOCAL_URL=http://host.docker.internal:3214
FASHN_LOCAL_TOKEN=<private-worker-token>
POSE_PROVIDER=flux_local
POSE_LOCAL_URL=http://host.docker.internal:3214
POSE_LOCAL_TOKEN=<same-private-worker-token>
GPU_EXPIRES_AT=<UTC-expiry-from-lease.json>
```

For native Next.js use `http://127.0.0.1:3214`. The workstation tunnel must be reachable from Docker Desktop; verify this from the app container. Neither the remote worker nor the SSH tunnel should expose an unauthenticated public endpoint. The AWS security group allows SSH only from the provisioner's public IP. Encrypted EBS volumes are deleted on termination; an EventBridge Scheduler role can terminate only the newly tagged lease, with one-minute schedule precision and at most five minutes of bounded delivery retries. A failed schedule setup terminates the new instance before any model installation. The dedicated provisioner operates only on its own tagged lease. An explicitly authorized borrowed host uses `scripts/setup_gpu.py --shared` and an ignored `shared.json` manifest containing its verified SSH host pin, existing key path, and expiry. Borrowed hosts are never terminated; a persistent systemd timer stops only `dti2irl-worker.service` at expiry. The worker also rejects expired inference requests.

`GET /health` requires `Authorization: Bearer <token>` and reports actual CUDA availability plus separate model readiness. FASHN requires main weights, both DWPose files, and a preparation marker created after parser initialization. FLUX requires a complete local snapshot and preparation marker. HTTP startup never downloads weights. `POST /render` applies a dress, or bottoms followed by tops. `POST /pose` uses the current outfit, identity (or optional face close-up), and a pose guide. The two endpoints share a GPU lock; the previous pipeline is unloaded before switching models. A busy worker returns 429 rather than running overlapping inference.

When the lease expires or the worker becomes unreachable, new photo renders are disabled and the last preview is preserved. The browser's 3D avatar remains usable. AI outputs can change likeness and garment details; neither photographic nor 3D previews measure sizing or simulate cloth fit.

For an already provisioned Linux CUDA machine, copy this directory and run `setup.sh` under `/home/ubuntu/dti2irl-worker`. For other paths, adapt its service configuration. The setup records the upstream FASHN commit and installed dependency versions. One worker process is required. GPU execution is verified separately from transport fixture tests; see the implementation verification report for the current deployment's evidence.

Primary references: [FASHN source](https://github.com/fashn-AI/fashn-vton-1.5), [FLUX.2-klein-4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B), [Diffusers FLUX API](https://huggingface.co/docs/diffusers/api/pipelines/flux2). FASHN and FLUX primary weights are Apache-2.0; inspect third-party parser and pose component licenses.
