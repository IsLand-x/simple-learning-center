# 端到端与视觉回归

测试服务通过临时数据目录运行，结束时仅删除该临时目录。不要把 E2E 指向个人数据目录或生产服务。

## 常规验证

```bash
npm run verify:full
```

没有安装 Google Chrome 时，使用 Playwright 自带的 Chromium：

```bash
npx playwright install chromium
LEARNING_CENTER_E2E_BROWSER=chromium npm run test:e2e
```

验证构建产物时先运行 `npm run build`，再执行：

```bash
LEARNING_CENTER_E2E_PRODUCTION=1 LEARNING_CENTER_E2E_BROWSER=chromium npm run test:e2e
```

## 视觉基线

`visual-regression.spec.ts` 比较书架、阅读器、RSS 阅读、视频学习和设置页面，共 40 张完整视口截图。每个页面都覆盖浅色/深色以及 375、768、1024、1440 四种宽度。`login-layout.spec.ts` 用相同组合覆盖未登录的应用壳，另有 8 张截图，共 48 张基线。

首次基线来自重构前提交 `8f9ed13c288538868cdaf143cc53805d307b1349` 的生产构建，使用 Linux、Playwright 1.63.0 自带 Chromium。测试固定日期、时区和语言，启用减少动态效果，并禁用 Service Worker。页面仍由真实构建渲染；状态接口提供固定的示例书、RSS 文章、视频字幕数据，YouTube iframe 使用本地响应代替外网内容。这避免其他用例的持久化写入、系统日期和第三方播放器影响像素比较。

```bash
LEARNING_CENTER_E2E_PRODUCTION=1 LEARNING_CENTER_E2E_BROWSER=chromium \
  npx playwright test tests/e2e/visual-regression.spec.ts tests/e2e/login-layout.spec.ts --project=desktop-chrome
```

截图差异容许比例为 `0.001`。字体、浏览器版本和操作系统变化也可能导致差异。失败时先检查 `test-results/` 的 actual、expected 和 diff，确认差异来自环境还是产品；不要为了让重构通过而更新基线。只有有意修改 UI 并审查过差异后，才使用 `--update-snapshots` 更新并提交对应 PNG。

## RSS 与视频业务用例

`rss-video-workflows.spec.ts` 在桌面和移动浏览器中验证：

- RSS 打开文章、已读状态、收藏筛选、刷新后保留和取消收藏。
- 视频字幕语言切换、字幕时间跳转、学习笔记持久化，以及桌面端删除视频时清理关联笔记（当前移动端没有该删除入口）。
- 提交视频链接、接收导入结果、打开相应视频和刷新后恢复。

这些用例使用真实状态分区和笔记存储 API；只替换 YouTube 播放器和视频导入上游响应，不需要个人视频、外网视频服务或模型凭据。

## 实际 EPUB 运行时

`foliate-runtime.spec.ts` 在桌面和移动浏览器中通过 OpenAPI 导入 `tests/fixtures/reader-regression.epub`，验证 Foliate iframe 内的真实正文、目录跳转、翻页、CFI 写入和刷新恢复。该夹具包含两章原创测试文字，不含外部资源或字体，足够产生多页；已有的 `openapi-sample.epub` 保持不变，继续用于服务端接口契约测试。
