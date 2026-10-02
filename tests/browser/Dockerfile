# Keep the browser, Ubuntu image and font packages identical for local and CI screenshots.
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk=1:20230817+repack1-3 \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
