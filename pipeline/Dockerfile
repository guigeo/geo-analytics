# Imagem do ETL geoespacial: GDAL + tippecanoe + pmtiles CLI + uv.
# Multi-arch: roda no Mac (arm64) e no VPS (amd64).
# Build context = ./pipeline (data/ e web/ ficam fora; entram via volume em runtime).
# ubuntu-full inclui o driver Arrow/Parquet (o small nao tem).
FROM ghcr.io/osgeo/gdal:ubuntu-full-latest

ARG PMTILES_VERSION=1.30.3

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential git libsqlite3-dev zlib1g-dev curl ca-certificates \
    && git clone --depth 1 https://github.com/felt/tippecanoe.git /tmp/tippecanoe \
    && make -C /tmp/tippecanoe -j"$(nproc)" \
    && make -C /tmp/tippecanoe install \
    && rm -rf /tmp/tippecanoe \
    && case "$(uname -m)" in \
         x86_64)  PM_ARCH=x86_64 ;; \
         aarch64) PM_ARCH=arm64 ;; \
         *) echo "arch nao suportada: $(uname -m)" && exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${PM_ARCH}.tar.gz" \
         | tar -xz -C /usr/local/bin pmtiles \
    && apt-get purge -y build-essential git \
    && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# venv fora de /repo para o bind mount do runtime nao o sobrescrever.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /repo/pipeline
COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project
COPY . .
RUN uv sync --no-dev

ENTRYPOINT ["geo-pipeline"]
CMD ["build"]
