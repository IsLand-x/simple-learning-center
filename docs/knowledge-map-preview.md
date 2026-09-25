# 全景知识地图预览部署

本次预览使用独立容器 `learning-center-knowledge-map-preview`，监听服务器 `127.0.0.1:4176`；独立数据卷为 `learning-center-knowledge-map-preview-data`。仅内置示例书籍，无生产书籍、笔记、进度、API Key 或 OAuth 凭据。账号为 `preview`，随机密码保存在服务器 `/home/orca/.local/share/learning-center-knowledge-map-preview.env`（0600），不提交 Git。使用订阅生图前需在此预览环境自行登录 ChatGPT/Codex。

现有 `learning-center.orca.island-x.autos` 的 DNS 与 HTTPS 已配置，Nginx 当前指向上一版书单预览的 4175 端口。新配置已准备在服务器 `/home/orca/.local/share/learning-center-knowledge-map-preview.nginx.conf`，仅将该预览域名的上游改为 4176。当前执行账号没有 Nginx 管理权限，需服务器管理员应用；无需修改 Vercel 域名配置，也不改变生产域名或 4174 端口。

```bash
sudo cp /etc/nginx/conf.d/learning-center-preview.conf /etc/nginx/conf.d/learning-center-preview.conf.before-knowledge-map
sudo install -m 644 /home/orca/.local/share/learning-center-knowledge-map-preview.nginx.conf /etc/nginx/conf.d/learning-center-preview.conf
sudo nginx -t && sudo systemctl reload nginx
```

若检查失败，应恢复备份配置，不重载 Nginx。应用配置后访问 `https://learning-center.orca.island-x.autos`，登录后在示例书籍侧栏选择 AI → ChatGPT/Codex 模型 → 全景知识地图。测试使用模拟模型和图片响应验证完整流程，真实订阅额度及模型生图权限需在账号登录后验证。

停止预览（保留示例数据）：

```bash
docker stop learning-center-knowledge-map-preview
```

验收完成后清理，仅针对本次预览。先恢复原预览上游，再删除本次容器及数据卷；原书单预览容器保持保留：

```bash
sudo cp /etc/nginx/conf.d/learning-center-preview.conf.before-knowledge-map /etc/nginx/conf.d/learning-center-preview.conf
sudo nginx -t && sudo systemctl reload nginx
docker rm -f learning-center-knowledge-map-preview
docker volume rm learning-center-knowledge-map-preview-data
```

本次 main 提交包含 `[preview]`，工程验证和提交专属镜像构建照常执行，生产部署跳过；不会更新生产容器或 `latest` 标签。

## 验证记录

`npm run verify` 通过：服务端 79 项、前端 81 项测试通过，lint 0 warning，格式、模块边界、死代码检查、TypeScript、Vite 与 PWA 构建均通过；构建仍有既有的第三方 eval 和大分块提示。

已执行 `LEARNING_CENTER_E2E_BROWSER=chromium LEARNING_CENTER_E2E_PRODUCTION=1 npm run verify:full`，测试全部通过，但首轮测试服务退出时外层进程收到 SIGTERM。随后独立运行相同生产构建的完整 Playwright 套件，退出码为 0：40 项通过、30 项按项目/设备条件跳过。知识地图覆盖 375、768、1024、1440 的浅深色组合、键盘焦点、移动触控尺寸、无横向溢出、额度提示、图片链接和历史恢复。当前机器使用 Playwright Chromium，未单独运行 Google Chrome 通道。生成供应商使用可控模拟响应测试；未把生产 OAuth 凭据用于预览或执行真实订阅生图。
