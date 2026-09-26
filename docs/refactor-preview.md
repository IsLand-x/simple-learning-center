# 整体重构测试实例

本次重构在 `IsLand-x/完全重构项目` 分支交付，不合并 `main`。目录职责与实现约束见 [架构说明](architecture.md)，功能清单与原始评估见 [重构评估](plans/full-refactor-review.md)。

## 隔离与访问

预览地址：<https://learning-center.orca.island-x.autos>。

- 容器：`learning-center-refactor-preview`。
- 示例数据卷：`learning-center-refactor-preview-data`。
- 仅绑定服务器 `127.0.0.1:4177`，容器内端口 `4174`。
- 使用远程认证模式，账号 `preview`；随机密码仅保存在服务器 `/home/orca/.local/share/learning-center-refactor-preview.env`，文件权限 `0600`。不提交凭据。
- 使用项目内置示例内容与仓库原创 EPUB 测试夹具，不复制生产书籍、笔记、阅读记录、OAuth 或 API Key。AI 的真实请求需自行配置供应商。
- RSS 自动刷新周期与首次延迟均为 24 小时，避免测试示例触发密集后台请求。

该域名现有 DNS、证书及 HTTPS 入口继续复用，只将其预览代理指向 `127.0.0.1:4177`。不修改 Vercel DNS、生产域名、生产容器或旧预览容器。

## 构建与重新部署

分支推送触发“工程验证”与“重构预览镜像”。预览工作流只发布 `ghcr.io/island-x/simple-learning-center:refactor-<完整提交 SHA>`，不发布 `latest`，不触发生产部署。工程验证包括类型、lint、格式、模块边界、死代码、单元测试、Vite/PWA、浏览器回归与 Docker 构建。

镜像通过验证后，在服务器执行：

```bash
bash deploy/refactor-preview.sh \
  ghcr.io/island-x/simple-learning-center:refactor-<完整提交 SHA> \
  /home/orca/.local/share/learning-center-refactor-preview.env
```

脚本只操作本页列出的预览容器和卷。更换镜像保留预览数据；健康检查使用 `/api/auth/session`。正式验收还应检查未登录数据访问被拒绝、HTTPS 登录、书架与真实 EPUB 阅读。

## 回归范围

基线截图从重构前的构建采集，涵盖登录、书架、阅读器、RSS、视频、设置，共 48 张：`375 / 768 / 1024 / 1440px`，分别浅色与深色。截图测试保留原始基线，不以更新快照接受重构差异。

真实 EPUB 用例验证导入、目录跳转、翻页、精确 CFI 与刷新恢复；另有 RSS 阅读/标注、视频字幕/笔记、状态分区、阅读进度、AI 任务、移动面板及返回操作等回归。外部模型与视频内容使用测试替身，不把这些结果视为真实供应商可用性验证。

复现完整检查：

```bash
npm ci
npx playwright install chromium
LEARNING_CENTER_E2E_BROWSER=chromium LEARNING_CENTER_E2E_PRODUCTION=1 npm run verify:full
git diff --check
```

Linux 截图环境需要 Noto Sans CJK SC 字体；CI 安装 `fonts-noto-cjk`。使用 Playwright Chromium 和移动视口仿真，未替代真实手机验收。

## 停止与清理

暂停服务并保留示例数据：

```bash
docker stop learning-center-refactor-preview
```

验收后，先将该预览域名的 Nginx `location /` 恢复为 `return 410;`，通过 `nginx -t` 后重载，再清理：

```bash
docker rm learning-center-refactor-preview
docker volume rm learning-center-refactor-preview-data
```

只删除上述容器、卷与专用凭据文件。不要删除生产资源或其他预览服务。

## 本次本地验收记录

2026-09-26，完整 `verify:full` 退出码为 0：94 项 Node 测试、90 项 Web 测试、74 项浏览器测试通过；56 项按设备条件跳过（多个视觉用例已经在桌面项目内循环验证移动宽度）。48 张迁移前截图全部通过对照。`npm audit --omit=dev --audit-level=high` 未发现漏洞，`git diff --check` 通过。

额外验证了中文路径下的开发监听：首次编译、修改后重新编译、API 自动重启、Vite 可访问以及 SIGTERM 后端口释放。构建保留既有第三方 eval 和较大分块提示，没有 TypeScript、Vite 或 PWA 构建失败。修正了旧测试的 Semi ButtonGroup 参考上下文、带图标按钮定位，以及迁移后的 mock 路径；没有通过降低产品断言或更新视觉基线接受变化。
