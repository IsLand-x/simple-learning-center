#!/bin/sh

set -eu

DEPLOY_DIRECTORY=/opt/learning-center
COMPOSE_FILE="$DEPLOY_DIRECTORY/compose.production.yaml"
APP_ENV_FILE="$DEPLOY_DIRECTORY/.env"
IMAGE_ENV_FILE="$DEPLOY_DIRECTORY/image.env"

if [ "$#" -ne 2 ]; then
  echo '用法：deploy.sh <image-digest> <registry-user>' >&2
  exit 2
fi

image=$1
registry_user=$2

if ! printf '%s\n' "$image" \
  | grep -Eq '^ghcr\.io/island-x/simple-learning-center@sha256:[0-9a-f]{64}$'; then
  echo '拒绝部署非预期镜像或非 digest 镜像' >&2
  exit 2
fi

if ! printf '%s\n' "$registry_user" | grep -Eq '^[A-Za-z0-9-]+$'; then
  echo '镜像仓库用户名格式无效' >&2
  exit 2
fi

if [ ! -r "$COMPOSE_FILE" ] || [ ! -r "$APP_ENV_FILE" ]; then
  echo '服务器部署配置不完整' >&2
  exit 1
fi

exec 9>/run/lock/learning-center-deploy.lock
if ! flock -n 9; then
  echo '已有部署正在进行' >&2
  exit 1
fi

docker_config=$(mktemp -d /tmp/learning-center-docker.XXXXXX)
trap 'rm -rf "$docker_config"' EXIT HUP INT TERM

registry_token=$(cat)
if [ -z "$registry_token" ]; then
  echo '缺少临时镜像仓库凭据' >&2
  exit 1
fi

printf '%s' "$registry_token" \
  | docker --config "$docker_config" login ghcr.io --username "$registry_user" --password-stdin >/dev/null
unset registry_token

previous_image=''
if [ -r "$IMAGE_ENV_FILE" ]; then
  previous_image=$(sed -n 's/^LEARNING_CENTER_IMAGE=//p' "$IMAGE_ENV_FILE" | head -n 1)
fi

write_image_env() {
  target_image=$1
  umask 077
  printf 'LEARNING_CENTER_IMAGE=%s\n' "$target_image" > "$IMAGE_ENV_FILE.next"
  mv -f "$IMAGE_ENV_FILE.next" "$IMAGE_ENV_FILE"
}

compose() {
  docker --config "$docker_config" compose \
    --env-file "$APP_ENV_FILE" \
    --env-file "$IMAGE_ENV_FILE" \
    --file "$COMPOSE_FILE" \
    "$@"
}

write_image_env "$image"
echo "开始部署 $image"

if compose pull learning-center \
  && compose up --detach --no-build --remove-orphans --wait --wait-timeout 90 learning-center; then
  echo "部署完成 $image"
  exit 0
fi

echo '新版本未通过部署或健康检查，开始回滚' >&2
if [ -n "$previous_image" ]; then
  write_image_env "$previous_image"
  compose up --detach --no-build --remove-orphans --wait --wait-timeout 90 learning-center
  echo "已回滚到 $previous_image" >&2
else
  compose rm --stop --force learning-center || true
  rm -f "$IMAGE_ENV_FILE"
  echo '首次部署失败，已移除未就绪容器' >&2
fi

exit 1
