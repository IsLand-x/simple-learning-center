# 按需独立预览部署与清理

日常需求与问题修复默认发布到生产环境。本方案仅在用户明确要求独立预览时使用，不作为日常发布前置条件。

## 1. 触发构建

在 GitHub Actions 中手动触发「预览镜像」工作流（`.github/workflows/preview.yml`），生成带对应提交 SHA 的独立镜像：

```text
ghcr.io/island-x/simple-learning-center:preview-<完整提交 SHA>
```

## 2. 部署预览容器

预览服务使用独立容器和独立数据卷，与生产容器及生产卷隔离。

```bash
bash deploy/preview.sh \
  ghcr.io/island-x/simple-learning-center:preview-<完整提交 SHA> \
  /home/orca/.local/share/learning-center-preview.env \
  4177 \
  learning-center-preview \
  learning-center-preview-data
```

- 脚本仅绑定服务器 `127.0.0.1:4177`，健康检查使用 `/api/auth/session`。
- 环境变量需配置 `LEARNING_CENTER_MODE=remote`，设置独立登录密码。

## 3. 验收与清理

验收完成后，停止并销毁预览容器及数据卷：

```bash
docker stop learning-center-preview
docker rm learning-center-preview
docker volume rm learning-center-preview-data
```

仅清理预览容器和卷，不影响生产服务与生产数据。
