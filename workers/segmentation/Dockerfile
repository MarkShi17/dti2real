FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir torch==2.8.0 torchvision==0.23.0 --index-url ${TORCH_INDEX}
ENV SAM2_BUILD_CUDA=0
RUN pip install --no-cache-dir wheel && pip install --no-cache-dir --no-build-isolation 'git+https://github.com/facebookresearch/sam2.git@2b90b9f5ceec907a1c18123530e92e794ad901a4' pillow==11.3.0
WORKDIR /worker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN mkdir /weights && python -c "import urllib.request,hashlib; p='/weights/sam2.1_hiera_small.pt'; urllib.request.urlretrieve('https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt',p); assert hashlib.sha256(open(p,'rb').read()).hexdigest()=='6d1aa6f30de5c92224f8172114de081d104bbd23dd9dc5c58996f0cad5dc4d38'"
COPY app.py masks.py test_masks.py ./
RUN python -m unittest -v test_masks && useradd --create-home --uid 10001 worker
USER worker
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
