# 全景知识地图预览部署

本次预览使用独立容器 `learning-center-knowledge-map-preview`，监听服务器 `127.0.0.1:4176`；独立数据卷为 `learning-center-knowledge-map-preview-data`。初始化仅使用内置示例书籍，不复制生产数据与凭据。登录配置保存在服务器 `/home/orca/.local/share/learning-center-knowledge-map-preview.env`（0600），不提交 Git。使用订阅生图前需在此预览环境自行登录 ChatGPT/Codex。

预览地址为 `https://learning-center.orca.island-x.autos`，Nginx 已切换至 4176。旧书单预览（4175）已停止，保留原容器与数据；生产端口为 4174。更新预览时保留现有数据卷与私有环境文件。

登录后在示例书籍侧栏选择 AI → ChatGPT/Codex 模型 → 全景知识地图。生成结果与历史对话中的图片支持点击全屏查看、缩放及返回关闭。测试使用模拟模型和图片响应验证完整流程，真实订阅额度及模型生图权限需在账号登录后验证。

停止预览（保留示例数据）：

```bash
docker stop learning-center-knowledge-map-preview
```

验收完成后清理，仅针对本次预览。先停用该预览域名的 Nginx 配置或将其切到后续预览，检查配置并重载后，再删除本次容器及数据卷：

```bash
docker rm -f learning-center-knowledge-map-preview
docker volume rm learning-center-knowledge-map-preview-data
```

本次 main 提交包含 `[preview]`，工程验证和提交专属镜像构建照常执行，生产部署跳过；不会更新生产容器或 `latest` 标签。

## 验证记录

`npm run verify` 通过：服务端 79 项、前端 81 项测试通过，lint 0 warning，格式、模块边界、死代码检查、TypeScript、Vite 与 PWA 构建均通过；构建仍有既有的第三方 eval 和大分块提示。

已执行 `LEARNING_CENTER_E2E_BROWSER=chromium LEARNING_CENTER_E2E_PRODUCTION=1 npm run verify:full`，测试全部通过，但首轮测试服务退出时外层进程收到 SIGTERM。随后独立运行相同生产构建的完整 Playwright 套件，退出码为 0：40 项通过、30 项按项目/设备条件跳过。知识地图覆盖 375、768、1024、1440 的浅深色组合、键盘焦点、移动触控尺寸、无横向溢出、额度提示、图片链接和历史恢复。当前机器使用 Playwright Chromium，未单独运行 Google Chrome 通道。生成供应商使用可控模拟响应测试；未把生产 OAuth 凭据用于预览或执行真实订阅生图。

## 图片全屏查看

对话图片复用 Semi Modal 展开为全屏视图，工具栏提供 100%–400% 缩放与适应屏幕，支持键盘及浏览器返回关闭。查看器的历史层保留阅读抽屉的标记，手机返回先关闭图片；关闭后恢复图片入口焦点。专项 E2E 覆盖四种代表宽度与浅深色、实际全屏边界、缩放滚动、44px 操作区、Escape/返回/关闭按钮和历史对话恢复。

本次最终 `LEARNING_CENTER_E2E_BROWSER=chromium LEARNING_CENTER_E2E_PRODUCTION=1 npm run verify:full` 正常退出：160 项单元测试、40 项 E2E 通过，30 项按设备条件跳过；`git diff --check` 通过。使用 Playwright Chromium，未运行 Google Chrome 通道。
