# B站与 YouTube 内容源技术方案

## 1. 设计结论

在现有 RSS 抓取器之前增加来源分发层，不引入完整 RSSHub：

```text
添加/手动刷新 API                  服务端定时调度器
         │                              │
         └──────────┬───────────────────┘
                    ▼
             fetchRssSource(source)
                    │
       ┌────────────┼──────────────┬────────────────┐
       ▼            ▼              ▼                ▼
   普通 RSS     B站每周必看     B站 UP 主       YouTube 频道
       │            │              │                │
       └────────────┴──────────────┴────────────────┘
                    ▼
              FetchedRssFeed
                    ▼
         现有合并、时间线、日报和 AI
```

来源适配器只负责“发现公开更新并规范化”。文章阅读、视频学习和 AI 仍由既有模块负责。

## 2. 与现有实现的连接点

- `server/rss.mjs` 已提供安全的远程 URL 校验、Feed 下载和 RSS/Atom/RDF 解析。
- `server/rssScheduler.mjs` 已提供错峰串行刷新、条目合并和浏览器并发写保护。
- `src/lib/rssApi.ts` 与 `RssPage` 已统一消费 `FetchedRssFeed`。
- `server/youtubeVideo.mjs` 已封装 `youtubei.js`、YouTube 代理和可操作错误。
- `src/store/useLearningStore.ts` 当前持久化版本为 21，本次提升到 22。

因此不新建另一套内容列表或调度器，只替换“如何得到 `FetchedRssFeed`”这一层。

## 3. 数据模型

### 3.1 来源描述

```ts
export type RssSource =
  | { kind: 'rss'; feedUrl: string }
  | { kind: 'bilibili-weekly' }
  | { kind: 'bilibili-up'; uid: string }
  | { kind: 'youtube-channel'; channelId: string; feedUrl: string };

export interface RssFeed {
  id: string;
  title: string;
  url: string;
  source: RssSource;
  siteUrl?: string;
  description?: string;
  type: RssFeedType;
  fetchFullContent?: boolean;
  folderId?: string;
  createdAt: number;
  updatedAt: number;
  lastFetchedAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  lastErrorCode?: RssSourceErrorCode;
}
```

`url` 保留为兼容和展示字段：普通 RSS 为 Feed URL，内置来源为公开主页 URL。实际抓取始终读取 `source`。

为兼容现有 `FetchedRssFeed`，内置适配器返回值中的 `feedUrl` 同样填写规范化后的公开主页 URL；它只用于初始化 `RssFeed.url` 和展示，后续刷新不得把它当作 RSS XML 地址请求。

### 3.2 条目

第一版继续使用现有 `RssItem`。适配器生成稳定 `id`：

- B站：`bilibili:<bvid>`，无 `bvid` 时为 `bilibili:av<aid>`；
- YouTube：`youtube:<videoId>`。

最终持久化 ID 仍加来源前缀 `${feedId}:${item.id}`，避免同一视频从不同聚合源进入时冲突。YouTube 视频学习操作从 `item.link` 解析视频 ID，无需在第一版扩展 `RssItem`。

### 3.3 状态迁移

持久化版本 21 → 22：

```ts
source: { kind: 'rss', feedUrl: feed.url }
```

所有旧 `rssFeeds` 都按以上规则迁移，其余数据不变。服务端增加 `RSS_SOURCE_STATE_VERSION = 22`，旧客户端 PUT 低版本快照时必须保留当前服务端的 `feed.source`、`lastSuccessAt` 和 `lastErrorCode`，不能只沿用现有版本 16 的 RSS 保护。

## 4. 服务端模块

建议增加：

```text
server/rssSources.mjs          # 来源 schema、输入规范化与分发
server/bilibiliFeeds.mjs       # 每周必看、UP 主投稿与 WBI 辅助
server/youtubeFeeds.mjs        # 频道解析与官方 Atom Feed
server/sourceSecrets.mjs       # B站 Cookie 独立存储和状态
```

对应测试文件：

```text
server/rssSources.test.mjs
server/bilibiliFeeds.test.mjs
server/youtubeFeeds.test.mjs
server/sourceSecrets.test.mjs
```

所有外部请求函数接受可注入的 `fetchImpl`、时钟和上游客户端，测试中不访问真实平台。

## 5. 来源分发器

```ts
async function fetchRssSource(source: RssSource, context): Promise<FetchedRssFeed> {
  switch (source.kind) {
    case 'rss':
      return fetchRssFeed(source.feedUrl);
    case 'bilibili-weekly':
      return fetchBilibiliWeekly(context);
    case 'bilibili-up':
      return fetchBilibiliUp(source.uid, context);
    case 'youtube-channel':
      return fetchYouTubeChannelFeed(source, context);
  }
}
```

分发器接收已经规范化的描述，不接受任意 host、header 或 Cookie。来源输入使用 Zod 判别联合校验，并限制字符串长度。

## 6. B站每周必看适配器

### 6.1 上游接口

参考 RSSHub 当前路由使用的两个公开 GET 接口：

1. `https://app.bilibili.com/x/v2/show/popular/selected/series?type=weekly_selected`
2. `https://app.bilibili.com/x/v2/show/popular/selected?type=weekly_selected&number=<number>`

参考实现：<https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/weekly-recommend.ts>

### 6.2 行为

- 第一个请求取得当前期号和期名；
- 第二个请求取得当前期视频列表；
- `siteUrl` 固定为 B站每周必看页面；
- Feed 标题固定为“B站每周必看”，期号写入描述，避免刷新时覆盖用户自定义名称；
- 内容 HTML 只输出封面、推荐理由和简介，不嵌入第三方 iframe；
- 发布时间优先使用上游可靠字段，不存在时使用首次抓取时间并在代码中明确回退。

### 6.3 请求约束

- 超时 15 秒；
- 最大响应 4 MiB；
- 校验 HTTP 状态、JSON Content-Type、业务 `code === 0` 和数组长度；
- 单次最多保留 100 条；
- 不发送 Cookie。

## 7. B站 UP 主适配器

### 7.1 输入规范化

接受纯数字 UID 或 `https://space.bilibili.com/<uid>`。只允许 `space.bilibili.com`，拒绝用户名密码、非 HTTPS 跳转和额外脚本式输入。保存后只使用 UID 构造固定上游 URL。

### 7.2 请求流程

```text
UID
 │
 ├─ 读取/缓存 WBI key（nav 接口）
 │
 ├─ 生成排序后的 WBI 查询参数和 w_rid
 │
 ├─ 请求 /x/space/wbi/arc/search
 │      ├─ 匿名成功 → 规范化
 │      └─ 风控/登录校验失败
 │             ├─ 有 Cookie → 带 Cookie 重试一次
 │             └─ 无 Cookie → 返回可操作错误
 │
 └─ 从投稿结果取得作者；头像与简介只做尽力获取
```

参考 RSSHub 的现状：该路由已经包含 WBI、Cookie 和 Playwright 回退，说明风控是持续风险：<https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/video.ts>

本项目第一版不加入 Playwright。原因是浏览器运行时会显著增加安装体积、内存、故障面和安全维护成本。若 API 与 Cookie 都失败，来源进入降级状态但保留历史内容。

### 7.3 WBI 与缓存

- WBI mixin key 只缓存在服务端内存，建议 TTL 6 小时；
- 发现签名失效时清除缓存并重试一次；
- 时间戳可注入，保证签名单元测试确定性；
- 不把签名或 Cookie 写入 `RssFeed`。

### 7.4 错误映射

```ts
type RssSourceErrorCode =
  | 'BILIBILI_COOKIE_REQUIRED'
  | 'BILIBILI_COOKIE_INVALID'
  | 'BILIBILI_RISK_CONTROL'
  | 'BILIBILI_UP_NOT_FOUND'
  | 'YOUTUBE_CHANNEL_NOT_FOUND'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE';
```

B站 HTTP 412、业务码 `-352` 或等价风控响应映射为 `BILIBILI_RISK_CONTROL`；明确未登录响应映射为 Cookie 错误。未知上游正文不得原样返回前端，防止泄露请求信息。

## 8. YouTube 频道适配器

### 8.1 输入规范化

- `UC...` 频道 ID：直接校验；
- `/channel/UC...`：从 URL 提取；
- `@handle` 或对应 URL：使用现有 `youtubei.js` 的 `resolveURL()` 获取 browse/channel ID；
- 解析成功后持久化频道 ID 和官方 Feed URL，不持久化用户输入别名。

### 8.2 Feed 获取

官方 Feed URL：

```text
https://www.youtube.com/feeds/videos.xml?channel_id=<channelId>
```

该响应交给现有 `fetchRssFeed` 和 Atom 解析器处理，继续复用响应大小、重定向和 SSRF 防护。`fetchRssFeed` 需要增加可选的 `fetchImpl` 参数；普通 RSS 使用全局 `fetch`，YouTube Feed 注入共享的代理 fetch。需要增加 YouTube Atom 固定样例测试，确保 `media:thumbnail`、作者、视频链接和发布时间解析正确。

RSSHub 的频道路由可用于对照输入形式和 Shorts 过滤行为，但第一版不复制其 Google API / youtubei 双实现：<https://github.com/DIYgod/RSSHub/blob/master/lib/routes/youtube/user.ts>

第一版保留 Shorts，与频道官方 Feed 一致；以后再增加过滤选项。

### 8.3 网络与代理

频道解析和 Feed 请求必须复用 `LEARNING_CENTER_YOUTUBE_PROXY`、环境代理和现有 YouTube 传输错误文案。为此应把 `youtubeFetch`、传输错误映射和 Innertube 单例从 `youtubeVideo.mjs` 提取为可复用的 `youtubeClient.mjs`，再通过 `fetchRssFeed(..., { fetchImpl: youtubeFetch })` 请求 Atom Feed，避免产生第二套代理实现。

## 9. B站凭证存储

### 9.1 文件

在数据目录增加：

```text
data/source-secrets.json
```

建议格式：

```json
{
  "formatVersion": 1,
  "bilibili": {
    "cookie": "...",
    "updatedAt": 0,
    "verificationStatus": "unverified",
    "lastVerifiedAt": 0,
    "accountLabel": ""
  }
}
```

使用现有原子写入思路，目录权限 `0700`、文件权限 `0600`。读取不存在的文件等同未配置。Cookie 最大 64 KiB，拒绝 CR/LF 和不能解析为 `name=value` 列表的输入。

### 9.2 安全边界

- `/api/state` 不返回该文件内容；
- GET 状态接口只返回 `configured`、验证状态、时间和脱敏账号标签；
- 不提供读取 Cookie 原文的 API；
- 日志记录错误码而非上游请求 headers；
- 错误脱敏函数将 Cookie 全文和常见字段值从 error chain 中移除；
- Cookie 只附加到固定的 `*.bilibili.com` GET 请求，不做写操作。

### 9.3 API

```text
GET    /api/content-source-credentials/bilibili
PUT    /api/content-source-credentials/bilibili
POST   /api/content-source-credentials/bilibili/verify
DELETE /api/content-source-credentials/bilibili
```

PUT 请求体只有 `{ "cookie": "..." }`。保存后执行验证；网络暂时不可用时保留 Cookie 并标记 `unverified`，明确认证失败时标记 `invalid`。DELETE 使用现有认证与前端 `confirmDialog`。

## 10. 内容源 API

### 10.1 解析并首抓

```text
POST /api/rss/sources/resolve
```

请求示例：

```json
{
  "kind": "bilibili-up",
  "input": "https://space.bilibili.com/2267573"
}
```

响应：

```json
{
  "source": { "kind": "bilibili-up", "uid": "2267573" },
  "result": {
    "title": "...",
    "description": "...",
    "siteUrl": "...",
    "feedUrl": "...",
    "fetchedAt": 0,
    "items": []
  }
}
```

### 10.2 刷新规范化来源

```text
POST /api/rss/sources/fetch
```

请求体为 `{ "source": RssSource }`，响应为 `FetchedRssFeed`。普通 RSS 仍保留现有 `/api/rss/fetch`，用于兼容当前客户端和已有测试；新 UI 可以逐步统一到来源 API。

所有 API 沿用远程模式认证、`Cache-Control: no-store` 和请求体大小限制。

## 11. 调度器调整

`refreshPersistedRssFeed` 从：

```js
fetchFeed(feed.url)
```

改为：

```js
fetchSource(feed.source)
```

调度周期开始时根据 `lastFetchedAt` 和来源最小间隔过滤未到期来源，再对到期来源打散和错峰。手动刷新直接调用来源 API，不走到期过滤。

同一来源增加进程内 in-flight Map，避免定时刷新和手动刷新重叠。服务重启后 Map 清空是可接受的。

## 12. 前端设计

### 12.1 添加来源

扩展现有 `RssPage` 添加弹窗：

- 第一项为“来源类型”；
- 表单根据类型切换输入；
- B站每周必看不显示地址输入；
- 内置来源自动设为视频；
- 点击“获取并订阅”调用 resolve API；
- 以规范化 `source` 判断重复，而不是比较原始 URL。

建议将表单拆为 `src/components/RssSourceForm.tsx`，避免继续增加 `RssPage.tsx` 体积。

### 12.2 凭证设置

新增 `src/components/ContentSourceSettings.tsx`，嵌入设置页“内容源”标签。输入框使用密码模式，不回填原 Cookie。状态标签使用 Semi 语义颜色，并同时提供文字，不能只靠颜色表达。

### 12.3 YouTube 学习入口

P1 在 YouTube 条目详情工具栏增加操作：

1. 用现有 `parseYouTubeVideoId` 语义识别链接；
2. 在 `videoResources` 中查重；
3. 已存在则导航到 `/videos?video=<resourceId>`；
4. 不存在则调用现有 `/api/videos/import`，保存后导航。

## 13. OPML 兼容

扩展字段：

```xml
learningCenterSourceKind="bilibili-up"
learningCenterSourceKey="2267573"
```

- 普通 RSS 的 `xmlUrl` 不变；
- YouTube 的 `xmlUrl` 写官方 Atom Feed；
- B站来源不伪造可公开消费的 RSS URL，使用 `htmlUrl` 加扩展字段；
- 导入器先读扩展字段，再回退到 `xmlUrl`；
- Cookie 永不导出。

## 14. 测试策略

### 单元测试

- 三种 B站 UP 输入解析和非法 host 拒绝；
- WBI 签名固定向量、key 过期重试和风控错误映射；
- 每周必看 JSON 规范化、期次变化和无发布时间回退；
- YouTube handle / URL / channel ID 规范化；
- YouTube Atom 的作者、缩略图、发布时间和视频 ID；
- Cookie 文件权限、原子写入、状态脱敏、CR/LF 拒绝；
- 来源 schema 对未知 kind 和超长字段的拒绝；
- 调度器最小间隔与 in-flight 去重。

### 集成测试

- resolve、fetch、credential 四组 API；
- 远程模式未认证请求返回 401；
- 定时刷新写入后，旧浏览器快照不能删掉新条目和 `source`；
- 删除来源清理条目、标注和日报引用；
- 普通 RSS API 保持兼容。

### 手工验证

- 一个真实 B站每周必看来源；
- 一个匿名可访问和一个需要 Cookie 的 UP 主；
- 一个 YouTube handle 和一个频道 ID；
- Cookie 有效、失效、替换和删除；
- YouTube 直连与代理环境；
- 375、768、1024、1440px 下的浅色和深色模式。

## 15. 上游参考与许可证边界

实施前可以把 RSSHub 浅克隆到临时目录并固定 commit，只检查以下文件及其直接依赖：

- `lib/routes/bilibili/weekly-recommend.ts`
- `lib/routes/bilibili/video.ts`
- `lib/routes/bilibili/cache.ts`
- `lib/routes/youtube/user.ts`

RSSHub 使用 AGPL-3.0。本项目不复制、vendor 或运行其路由代码；只依据公开接口行为独立实现，并在测试和文档中保留上游链接。若未来决定直接嵌入 RSSHub 代码，需要另行做许可证与发布方式评审。
