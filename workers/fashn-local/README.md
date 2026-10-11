# FASHN VTON 1.5 worker

This implements the documented `TryOnPipeline(weights_dir=...)` API. It is a separate process from Next.js, accepts base64 images, and never retrieves user-supplied URLs. Hosted FASHN `tryon-v1.6` is a separate product with different arguments.

Use a Linux CUDA GPU and Python 3.10–3.12. H100 hardware is suitable; this project does not provision or rent infrastructure. Exact VRAM usage and B300 compatibility have not been benchmarked here. Follow upstream PyTorch/CUDA requirements for the rented machine.

```bash
git clone https://github.com/fashn-AI/fashn-vton-1.5.git /opt/fashn-vton
python3.11 -m venv /opt/fashn-venv
source /opt/fashn-venv/bin/activate
pip install -e /opt/fashn-vton
pip install -r workers/fashn-local/requirements.txt
python /opt/fashn-vton/scripts/download_weights.py --weights-dir /opt/fashn-weights
export FASHN_WEIGHTS_DIR=/opt/fashn-weights
export FASHN_WORKER_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
uvicorn app:app --app-dir workers/fashn-local --host 127.0.0.1 --port 8080 --workers 1 --no-access-log
```

Record the upstream commit after checkout (`git -C /opt/fashn-vton rev-parse HEAD`) for reproducible infrastructure. Model/DWPose downloads total roughly 2 GB; the upstream human parser also downloads on first inference. **The Next.js app never downloads weights.**

On a remote GPU, bind the worker to loopback and establish an SSH tunnel:

```bash
ssh -N -L 8080:127.0.0.1:8080 user@gpu-host
```

Set `.env.local`:

```dotenv
TRYON_PROVIDER=fashn_local
FASHN_LOCAL_URL=http://127.0.0.1:8080
FASHN_LOCAL_TOKEN=the-same-value-as-FASHN_WORKER_TOKEN
```

For Docker Desktop use `http://host.docker.internal:8080` and bind your SSH tunnel so the Docker VM can reach it, or put the worker on a private Docker network. Never expose an unauthenticated GPU endpoint publicly. Restart the app container after changing environment values.

`GET /health` reports whether the required main weights exist and whether the pipeline has loaded. `POST /render` requires `Authorization: Bearer <token>` and returns `{image: "data:image/png;base64,...", status: "completed"}`. Inference is serialized; a busy worker returns 429.

The app applies a dress, or bottoms followed by a top. The model preserves the input pose; it does not perform arbitrary reposing, simulate exact fit, or reliably add bags/jewelry. See the separate `POSE_PROVIDER=fal` adapter for pose edits.

Reference: [upstream FASHN repository](https://github.com/fashn-AI/fashn-vton-1.5). Code/primary weights are Apache-2.0; inspect the upstream licenses of third-party parser and pose components. GPU inference was not executed in this build environment.
