# B站与 YouTube 内容源实施任务

## 0. 实施前确认

- [x] 评审并确认 P0 / P1 边界，尤其是“YouTube 条目进入视频学习”是否随首版上线。
- [ ] 实施前仅将 RSSHub 浅克隆到临时目录并固定 commit，记录参考 commit，不复制上游代码。
- [ ] 用真实账号确认 B站 UP 主接口在匿名、有效 Cookie 和失效 Cookie 下的响应形态。

## 1. 数据模型与迁移

- [x] 在 `src/types.ts` 增加 `RssSource` 判别联合和来源错误码类型。
- [x] 为 `RssFeed` 增加 `source`、`lastSuccessAt`、`lastErrorCode`。
- [x] 将 Zustand 持久化版本从 21 提升到 22，把旧订阅迁移为 `{ kind: 'rss', feedUrl: feed.url }`。
- [x] 更新 store merge 默认值和服务端旧客户端写回保护，确保来源描述不会被旧快照覆盖。
- [x] 为迁移和并发保护增加回归测试。

## 2. B站凭证服务

- [x] 在 `server/config.mjs` 增加 `SOURCE_SECRETS_FILE` 和凭证请求体大小限制。
- [x] 实现 `server/sourceSecrets.mjs`：校验、原子写入、`0600` 权限、脱敏状态、删除和验证结果。
- [x] 实现 B站 Cookie 的 CR/LF 拒绝、长度限制和固定域名使用约束。
- [x] 在 `server/app.mjs` 增加 GET / PUT / POST verify / DELETE API。
- [ ] 增加权限、缺失文件、网络失败、认证失败和日志脱敏测试。

## 3. 来源框架

- [x] 实现 `server/rssSources.mjs` 的 Zod schema、输入规范化、分发和最小刷新间隔。
- [x] 增加 `/api/rss/sources/resolve` 与 `/api/rss/sources/fetch`。
- [x] 保留 `/api/rss/fetch` 兼容普通 RSS 旧客户端。
- [ ] 为未知来源、非法字段、超长输入和非预期上游响应增加测试。

## 4. B站每周必看

- [x] 实现当前期次和视频列表的两步请求。
- [x] 校验上游状态、业务码、响应大小和最大条目数。
- [x] 规范化标题、期次、作者、封面、简介、推荐理由、链接和稳定 ID。
- [x] 对发布时间缺失建立明确回退，不伪造时间。
- [ ] 增加期次切换后保留旧条目的合并测试。

## 5. B站 UP 主投稿

- [x] 实现纯 UID 与空间 URL 解析、规范化和去重 key。
- [x] 实现 WBI key 获取、mix key、签名、TTL 缓存和失效重试。
- [x] 实现匿名请求，以及风控后使用已配置 Cookie 重试一次。
- [x] 规范化 UP 主信息和最近投稿，使用 `bvid` / `aid` 生成稳定 ID。
- [x] 实现 HTTP 412、业务码 `-352`、Cookie 失效、UP 主不存在、超时和限流错误映射。
- [x] 确认任何日志和前端错误都不包含 Cookie、签名或完整上游 headers。
- [x] 明确第一版没有 Playwright 回退，并为失败状态保留历史内容。

## 6. YouTube 频道 Feed

- [x] 把 YouTube 代理 fetch 和 Innertube 单例提取到共享 `youtubeClient.mjs`。
- [x] 支持 `@handle`、handle URL、channel URL 和频道 ID 解析。
- [x] 使用规范化频道 ID 构造官方 Atom Feed URL。
- [x] 为 `fetchRssFeed` 增加可注入 `fetchImpl`，让 YouTube Atom 请求复用现有代理。
- [x] 复用现有 RSS 解析器，并补齐 YouTube Atom 固定样例测试。
- [x] 复用现有 YouTube 代理错误文案，验证直连和代理配置。
- [x] 保留 Shorts，不在第一版加入过滤设置。

## 7. 调度与合并

- [x] 将 `rssScheduler` 的抓取入口从 URL 改为来源分发器。
- [x] 实现普通 RSS、YouTube、B站 UP 主和每周必看的最小刷新间隔。
- [x] 增加进程内 in-flight 去重，避免手动与定时刷新重叠。
- [x] 保持错峰串行、每轮最多 6 篇自动原文和既有条目状态合并逻辑。
- [x] 定时失败只持久化来源错误，不弹浏览器 Toast。

## 8. 添加与管理界面

- [ ] 把动态添加表单拆为 `RssSourceForm` 组件。
- [x] 增加四种来源选择及对应输入、loading、disabled、预览和错误状态。
- [x] 内置来源自动标记为视频，隐藏“自动原文”设置。
- [x] 使用规范化来源判断重复，并在重复时选中已有来源。
- [x] 管理抽屉展示来源类型、最近成功时间和可操作错误。
- [x] 验证移动端 16px 输入、44px 触控目标、长名称省略和无横向溢出。

## 9. 设置页内容源凭证

- [x] 增加“内容源”设置标签和 B站凭证卡片。
- [x] 实现空密码输入、保存并验证、状态展示、替换和统一确认删除。
- [x] 前端只保存状态，不把 Cookie 写入 Zustand。
- [x] 在远程模式提示认证和 HTTPS 风险。
- [x] 验证浅色、深色、桌面和移动布局。

## 10. YouTube 视频学习入口（P1）

- [x] 在 YouTube Feed 详情增加“加入视频学习 / 打开视频学习”。
- [x] 按 YouTube 视频 ID 查重，避免重复导入。
- [x] 复用现有 `/api/videos/import` 和 `videoResources` 保存逻辑。
- [x] 成功后导航到现有视频学习页，失败保留当前 Feed 页面并提示原因。

## 11. OPML

- [x] 为三类内置来源写入学习中心扩展字段。
- [x] YouTube 同时导出官方 Atom `xmlUrl`。
- [x] B站只导出来源类型、规范化 key 和主页，不导出 Cookie。
- [x] 导入器优先识别扩展字段，保留普通 OPML 兼容。
- [x] 导出含 B站来源时提示其他阅读器兼容性限制。

## 12. 文档与验收

- [x] 更新 README 功能、数据目录、Cookie 安全、代理、限制和 RSSHub 策略。
- [x] 更新 `package.json` build 检查列表，覆盖所有新增服务端模块。
- [x] 执行 `npm test`。
- [x] 执行 `npm run build`。
- [x] 执行 `git diff --check`。
- [x] 按 PRD 在 375、768、1024、1440px 完成浅色与深色验收。
- [ ] 使用真实来源完成一次不少于 24 小时的定时刷新观察，确认无重复条目和 Cookie 泄露日志。
