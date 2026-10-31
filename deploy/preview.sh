#!/usr/bin/env bash
set -euo pipefail

# 通用按需独立预览部署脚本
image_ref=${1:?Usage: deploy/preview.sh IMAGE_REF PRIVATE_ENV_FILE [PORT] [CONTAINER_NAME] [VOLUME_NAME]}
environment_file=${2:?A private environment file is required}
port=${3:-4177}
container=${4:-learning-center-preview}
volume=${5:-learning-center-preview-data}

test -f "$environment_file"
docker pull "$image_ref"
docker volume create "$volume" >/dev/null
if docker container inspect "$container" >/dev/null 2>&1; then
  docker stop "$container" >/dev/null
  docker rm "$container" >/dev/null
fi
docker run -d \
  --name "$container" \
  --restart unless-stopped \
  --env-file "$environment_file" \
  --env LEARNING_CENTER_MODE=remote \
  --env LEARNING_CENTER_DATA_DIR=/data \
  --env LEARNING_CENTER_PORT=4174 \
  --publish "127.0.0.1:${port}:4174" \
  --mount "type=volume,source=$volume,target=/data" \
  "$image_ref"

for attempt in {1..30}; do
  if curl --fail --silent "http://127.0.0.1:${port}/api/auth/session" >/dev/null; then
    printf 'Preview is responding at 127.0.0.1:%s (%s)\n' "$port" "$image_ref"
    exit 0
  fi
  sleep 2
done
printf 'Preview health check failed. Inspect only %s.\n' "$container" >&2
exit 1
