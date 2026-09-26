#!/usr/bin/env bash
set -euo pipefail

# Deliberately separate from deploy.sh and the production container/volume.
image_ref=${1:?Usage: deploy/refactor-preview.sh IMAGE_REF PRIVATE_ENV_FILE}
environment_file=${2:?A private environment file is required}
container=learning-center-refactor-preview
volume=learning-center-refactor-preview-data

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
  --env LEARNING_CENTER_RSS_REFRESH_INTERVAL_MS=86400000 \
  --env LEARNING_CENTER_RSS_REFRESH_INITIAL_DELAY_MS=86400000 \
  --publish 127.0.0.1:4177:4174 \
  --mount "type=volume,source=$volume,target=/data" \
  "$image_ref"

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:4177/api/auth/session >/dev/null; then
    printf 'Preview is responding at 127.0.0.1:4177 (%s)\n' "$image_ref"
    exit 0
  fi
  sleep 2
done
printf 'Preview health check failed. Inspect only %s.\n' "$container" >&2
exit 1
