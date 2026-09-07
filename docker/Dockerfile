FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3.10-venv python3-pip \
    gdal-bin libgdal-dev libgdal30 \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal
ENV GDAL_VERSION=3.6.2

WORKDIR /app

COPY requirements.txt requirements-gpu.txt ./
RUN pip3 install --no-cache-dir GDAL==$(gdal-config --version) \
    && pip3 install --no-cache-dir -r requirements.txt -r requirements-gpu.txt

COPY src/ ./src/
COPY scripts/ ./scripts/
COPY ui/ ./ui/
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

RUN mkdir -p /incoming/before /incoming/after /data/lancedb /logs /models/remoteclip /models/prithvi /models/adapters

VOLUME ["/incoming", "/data", "/logs", "/models"]

EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
