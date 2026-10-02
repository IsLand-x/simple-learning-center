# 信息图预览部署

预览服务使用独立容器 `learning-center-infographic-preview`，只绑定服务器 `127.0.0.1:4176`；独立卷为 `learning-center-infographic-preview-data`。首次使用仅初始化项目内置示例数据，不复制生产数据、OAuth 凭据或 API Key。账号为 `preview`，随机密码保存在服务器 `/home/orca/services/learning-center-infographic-preview/.env`，权限 0600。

预览域名仍为 `learning-center.orca.island-x.autos`。当前域名的 Nginx 配置返回 410，恢复入口需要管理员执行以下命令；预览配置已准备为 `/home/orca/services/learning-center-infographic-preview/nginx.conf`，仅把该预览域名代理到 4176，复用该域名现有证书，不涉及生产域名或 Vercel DNS：

```bash
sudo cp /etc/nginx/conf.d/learning-center-preview.conf /etc/nginx/conf.d/learning-center-preview.conf.before-infographic
sudo install -m 644 /home/orca/services/learning-center-infographic-preview/nginx.conf /etc/nginx/conf.d/learning-center-preview.conf
sudo nginx -t && sudo systemctl reload nginx
```

Nginx 配置检查失败时不要重载，恢复备份后重新检查。若域名尚未指向此服务器，需要用户在 Vercel 中配置 A 记录：`learning-center.orca` → `43.160.252.99`；本次不修改 DNS。

访问后在设置中自行登录 ChatGPT/Codex，打开示例书籍 → AI →「生成信息图」，或直接指定主题和样式。真实订阅生图取决于所选模型权限和账号额度；自动测试使用模拟响应，不会调用生产账号生图。

停止服务但保留示例数据：

```bash
docker stop learning-center-infographic-preview
```

验收后清理：先恢复预览域名的 410 配置并通过 `nginx -t` 后重载，再执行：

```bash
docker rm learning-center-infographic-preview
docker volume rm learning-center-infographic-preview-data
```

仅清理上述容器和卷。生产服务、生产数据以及旧预览环境均不属于清理范围。提交说明包含 `[preview]`，GitHub Actions 验证并发布提交专属镜像，跳过生产部署和 `latest` 更新。

## 验证记录

`npm run verify` 已通过；最终代码的 `LEARNING_CENTER_E2E_BROWSER=chromium LEARNING_CENTER_E2E_PRODUCTION=1 npm run verify:full` 完成 lint、格式、边界、死代码检查、167 项单元测试、TypeScript、Vite/PWA 构建及全部 48 项浏览器测试，38 项按设备条件跳过。浏览器套件输出成功汇总后，外层命令在测试服务清理阶段收到 SIGTERM（退出码 143），与旧预览记录中的现象一致，不能将这个退出码写成 0。构建仅有既有的第三方 eval 和大分块提示。

信息图覆盖 375、768、1024、1440 的浅深色组合，以及入口禁用、历史图片、全屏缩放、返回关闭和 44px 移动触控尺寸。修正了测试在 Semi 弹窗入场变换尚未结束时立即读取尺寸的竞态，改为等待达到完整视口尺寸。使用 Playwright Chromium，未运行 Google Chrome 通道、真实手机或真实 ChatGPT 生图。六种预设、逐项来源、原文标签、内容容量、规划前置、失败/取消及重复调用由服务端测试覆盖。

随后用 `setsid` 独立运行修正的 `生成信息图入口、图片与历史 1440 light` 用例：1 项通过，进程退出码 0。`git diff --check` 通过。
