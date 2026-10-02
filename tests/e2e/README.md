# 端到端与视觉回归

测试服务通过临时数据目录运行，结束时仅删除该临时目录。不要把 E2E 指向个人数据目录或生产服务。完整回归需要可用的 Docker。

## 常规验证

```bash
npm run verify:full
```

构建完成后，单独执行与 CI 相同的浏览器验证：

```bash
npm run test:e2e:container
```

`tests/browser/Dockerfile` 固定 Playwright 1.63.0 的 Ubuntu 24.04 镜像 digest 与 Noto CJK 包版本；`tests/browser/run.mjs` 校验其版本与 lockfile 一致。容器使用仓库依赖、独立网络和临时示例数据，退出后自动删除；本地只保留可复用的测试镜像，不挂载生产数据或 Docker socket。

原生浏览器入口用于交互调试。没有安装 Google Chrome 时，可使用 Playwright 自带的 Chromium：

```bash
npx playwright install chromium
LEARNING_CENTER_E2E_BROWSER=chromium npm run test:e2e -- --grep-invert 'workspace visual parity|unauthenticated login shell'
```

验证构建产物时先运行 `npm run build`，再执行：

```bash
LEARNING_CENTER_E2E_PRODUCTION=1 LEARNING_CENTER_E2E_BROWSER=chromium npm run test:e2e
```

## 视觉基线

`visual-regression.spec.ts` 比较书架、阅读器、RSS 阅读、视频学习和设置页面，共 40 张完整视口截图。每个页面都覆盖浅色/深色以及 375、768、1024、1440 四种宽度。`login-layout.spec.ts` 用相同组合覆盖未登录的应用壳，另有 8 张截图，共 48 张基线。

基线来自重构前提交 `8f9ed13c288538868cdaf143cc53805d307b1349` 的不可变生产构建。首次宿主机截图在 CI 暴露了 OpenCloudOS/Ubuntu 的字体 fallback 差异，及书架旧截图混入先前用例进度的问题；修正后在固定测试容器内，用同一旧构建重新采集。新构建只参与比较，不用于生成重构基线。

2026-09-26 重新采集时，旧版与新版使用完全相同的 `workspace-fixtures.ts`，没有修改原应用源码或构建文件。原构建 `dist/index.html` 的 SHA-256 为 `d959a0d5080d8a4211edbfa2bc2593e497c680e07017d2c8cbac5c05816b76a2`；43 个 `dist/assets/` 文件按相对路径排序，逐行拼接 `SHA-256 + 两个空格 + 相对路径 + 换行` 后的 SHA-256 为 `3669c911c75b84cc48ddc4de137b50ac64ed0ecfb9b4c1d618f5cba606466343`。这些摘要用于追踪基线来源，构建产物本身不提交。

测试固定日期、时区和语言，启用减少动态效果，并禁用 Service Worker。页面仍由真实构建渲染；视觉状态完全由独立字面量夹具提供，不读取服务端已有状态，书架进度、章节、时间还另有语义断言。YouTube iframe 使用本地响应，阅读字体 CDN 被拦截，统一使用测试容器中的离线字体，避免网络字体或其他用例的写入改变像素。

```bash
npm run test:e2e:container -- tests/e2e/visual-regression.spec.ts tests/e2e/login-layout.spec.ts --project=desktop-chrome
```

截图差异容许比例为 `0.001`。不要在不同宿主机字体环境下更新容器基线。失败时先检查 `test-results/` 的 actual、expected 和 diff，确认差异来自环境还是产品；不要为了让重构通过而更新基线。浏览器、字体或截图夹具升级时，先在固定环境下验证旧构建并审查差异，再生成基线；产品有意修改 UI 时同样需要明确审查。

## RSS 与视频业务用例

`rss-video-workflows.spec.ts` 在桌面和移动浏览器中验证：

- RSS 打开文章、已读状态、收藏筛选、刷新后保留和取消收藏。
- 视频字幕语言切换、字幕时间跳转、学习笔记持久化，以及桌面端删除视频时清理关联笔记（当前移动端没有该删除入口）。
- 提交视频链接、接收导入结果、打开相应视频和刷新后恢复。

这些用例使用真实状态分区和笔记存储 API；只替换 YouTube 播放器和视频导入上游响应，不需要个人视频、外网视频服务或模型凭据。

## 实际 EPUB 运行时

`foliate-runtime.spec.ts` 在桌面和移动浏览器中通过 OpenAPI 导入 `tests/fixtures/reader-regression.epub`，验证 Foliate iframe 内的真实正文、目录跳转、翻页、CFI 写入和刷新恢复。该夹具包含两章原创测试文字，不含外部资源或字体，足够产生多页；已有的 `openapi-sample.epub` 保持不变，继续用于服务端接口契约测试。
