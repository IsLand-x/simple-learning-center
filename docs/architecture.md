# Learning Center 架构

## 运行形态

一个 React 18 / TypeScript / Vite 浏览器应用、一个 Node.js / Hono 数据服务和独立用户数据目录。继续使用 Semi Design、Tailwind、Zustand persist、Allotment、Foliate.js、Tiptap 和 PiAgent / Pi AI；不增加数据库、多用户系统或第二套持久化缓存。

前端构建到 `dist/`，Node ESM 构建到 `server-dist/`。开发、测试和部署使用同一套服务代码。`contracts/` 按领域定义共用实体；浏览器不导入服务端实现。

## 前端目录与查找方式

```text
src/
  main.ts
  layout/                 启动、鉴权、登录、路由、程序壳
  components/             跨页面实际复用的 UI
  pages/
    books/list/           书架、书单、导入、回收站
    books/detail/         阅读器与学习面板
    rss/reader/           订阅源、列表、文章、日报、助手
    videos/study/         视频资料、播放器、字幕与学习笔记
    settings/             账号、模型、内容源、授权与关于
  api/
    rss/
      index.ts            RssApi class 和实例
      type.ts             本域请求体与响应体
    books/                同样使用 index.ts + type.ts
    ai/ auth/ reading/ settings/ state/ videos/
    http/                 内部 transport、错误与传输类型
  store/                  唯一 Zustand 持久化状态及同步
  types/                  仅浏览器使用的跨页面类型
  util/                   确有跨页面用途的纯工具与适配器
  styles/                 Tailwind 入口与必要兼容样式
contracts/
  books.d.ts reading.d.ts rss.d.ts videos.d.ts ai.d.ts settings.d.ts
```

每个 TSX 文件只定义一个组件，每个组件只有一个实现文件。简单组件使用单个文件；复杂区域将组件、私有 Hook、纯计算和测试放在一个目录。页面入口保留 `index.tsx`，组件文件使用真实组件名称，例如 `SourcesPanel.tsx`、`ReaderPageHeader.tsx`，不为每个组件再创建 index 或转发文件。已有共享组件直接导入，不增加单页转发壳。

页面入口只组合区域与稳定的生命周期所有者。页面 `store/` 只保留跨区域的状态和导航；组件自己的展开、草稿、提交状态在组件内，复杂时放同级 `useX.ts`。不统一创建 `hooks/model/application/ui` 等多层配套目录，也不把全页逻辑原样搬入大 Hook。

例如改添加订阅表单，先看 `pages/rss/reader/components/SourcesPanel`；改书籍图片资源，看 `books/detail/components/ResourcesPanel`；改视频笔记，看 `videos/study/components/Playback`。协议变更才进一步修改 `api/<domain>/index.ts` 和 `type.ts`。

书架封面恢复和 EPUB 导入属于书架；Foliate 适配、书内段落读取、手势和文字光标属于阅读器。旧浏览器存储读取跟随 `store/persistence`。阅读字体、主题和共用 AI 提示词有多个实际消费者，继续放在 util。

## 状态归属与生命周期

状态交给最小的稳定所有者。把状态移入组件时，同时核对隐藏、重新打开、跨断点、切换选中资源与离开页面时的保留/重置行为，不能只根据 import 数量迁移 Hook。

- RSS 的 `source/feed/item/digest/range/view/panel` 继续由 URL 驱动，保留默认项、失效参数回退、push/replace、刷新直达和返回行为，不创建双向同步的第二份选中状态。
- RSS 页面只建立一个状态作用域，Context 以 navigation / sources / article / tasks 的明确接口连接区域；各 Hook 通过参数连接，不互相读取 Context。页面直接组合桌面/移动工作区和常驻弹窗，Dialog 内拥有自己的草稿。任务恢复、订阅、结果回写在页面生命周期中执行，不随可见面板切换重复启动。
- 阅读器只随 `book.id` 建立生命周期，其余最新参数通过稳定 ref 输入。`ReaderPageContent.tsx` 负责页面编排，页面共享的标注、导航、布局、会话 Hook 放在本页 store；标注状态与动作由同一个 Hook 管理。Foliate 和演示正文归入 ReaderSurface 的私有目录，阅读页其它区域不依赖它们的实现。
- 视频导入弹窗自己持有 URL 和提交状态；播放时间、播放器 ref 和字幕模式是播放器与字幕共用状态，保留在稳定页面范围。学习笔记逻辑位于播放区域。
- 设置页模型编辑 ID 需要在 Tabs 卸载/重建内容时保留，因此仍由稳定的设置页拥有；输入字段和提交状态留在表单。

根 `store/useLearningStore.ts` 是唯一持久化入口。persist key 仍为 `learning-center-state-v1`，version 仍为 33，library / reading / conversations / rss / videos / preferences 六个分区保持不变。路由继续 lazy loading 与 StateDomainGate。目录重构不修改用户数据格式。

## API 与类型

业务 API class 集中构造请求、序列化、响应解析、错误、取消、认证事件与 SSE。`api/<domain>/type.ts` 与实现成对存放，请求和响应均有明确类型。无正文结果返回 void，二进制文件与可缺失文件明确建模，状态快照区分 200 / 204 / 304 和 ETag，任务事件使用实际 payload 类型。组件、Hook、store 与 util 不直接 fetch，也不调用内部 transport。

`contracts/<domain>.d.ts` 保存前后端共用实体；API 类型直接引用，不复制实体。选区屏幕坐标、面板状态和 React 控制类型留在 `src/types` 或对应区域。没有总 `domain.ts` 转发文件，也不通过 UI 类型污染服务端契约。

## 后端模块

```text
server/
  index.ts                 进程与调度器生命周期
  app.ts                   按既定顺序挂载 middleware 和子路由
  dependencies.ts          构造共享依赖
  config.ts
  http/                    请求解析、响应、静态资源等 HTTP 原语
  infrastructure/          文件系统及外部 HTTP 原语
  modules/
    books/                 导入、书架、回收站、笔记、索引、图片、MCP
    rss/                   来源、正文、刷新、翻译与定时任务
    videos/                视频元数据与字幕
    ai/                    模型、工具、任务与 generation
    auth/                  应用认证与 middleware
    settings/              凭据、Token、运行信息
    state/                 stateStore、serialization 与 compatibility
  tests/                   整个应用、路由顺序等集成测试
```

业务路由、实现与领域测试就近存放，只有 `app.ts` 装配子路由。书籍模块可以提供 books、search、import、MCP 等多个 router，保持原 URL；目录聚合不等于改 HTTP 前缀。复杂业务按真实职责拆文件，不强制增加 controller/service/repository 转发层。

知识地图和信息图执行归 `ai/generation`；图片落盘、书籍存在性校验、收藏与重命名归 books。AI 使用书籍服务，books 不反向依赖 AI 运行时。

`modules/state/stateStore.ts` 保持 state.json 唯一串行提交入口；序列化及纯保护规则就近独立。AI、RSS、阅读与删除合并保留原顺序。队列回调不得再次入队，底层状态服务不得反向调用业务副作用。图片保存与书籍删除共享原有串行边界；认证、Token 和来源凭据继续使用各自独立队列。

路由契约固定原有 87 条注册记录，保持 Cookie、ETag、SSE、错误与静态兜底语义。`scripts/test-server.mjs` 递归发现测试并核对源文件与构建产物，避免测试迁移后被根目录 glob 漏掉。

## 边界门禁

- 页面之间不互相导入私有实现；真正共用的 UI 上移 components，共用能力上移 util。
- components 不依赖 pages/layout；util 不依赖界面或 store；根 store 不依赖界面。
- API 只依赖传输与纯类型；类型文件不能包含运行时代码。
- contracts 不依赖浏览器或服务端实现；infrastructure 不依赖业务 modules。
- stateStore/serialization 不反向依赖其他业务模块；books 不依赖 AI。

`check:boundaries` 通过 TypeScript AST 和模块解析检查静态/动态导入、重导出、循环依赖、API 文件配对及纯类型声明。`check:components` 检查所有生产 TSX 恰好定义一个组件，测试 TSX 最多一个组件，测试夹具单独管理。两项都进入 `verify`，并保留 TypeScript 未使用检查、零 warning lint、格式和 Knip。

## 样式与 Foliate 兼容

普通布局继续使用 Tailwind 和 Semi 语义变量，主题与阅读纸张独立。富文本、EPUB iframe、第三方 DOM、复杂选择器、安全区及确需级联的规则保留 CSS。现有编号 CSS 顺序是兼容契约，不为整理目录一次重排。动态坐标与主题预览可以使用 inline style。

阅读器的 `components/ReaderSurface/foliate/` 统一承载生命周期、导航、选区控制、手势输入与监听安装/清理，配合 `vite.config.ts` 的源码变换。CFI、Paginator、Overlayer、导航队列、iframe 安全通道与稳定 ref 协议保留。只有一个装配入口负责监听与 cleanup，不另建阅读器实例或并行导航系统。

## 验证与发布

`verify` 包含类型、lint、格式、组件与模块边界、死代码、Node/Web 测试、Vite/PWA 构建。`verify:full` 再用固定 Docker 浏览器环境执行 E2E。保留原 48 张视觉基线，覆盖四种宽度、两种主题、登录与五个页面；另有真实 EPUB、RSS、视频、表单草稿与持久化行为回归。所有 E2E 使用临时示例数据，单 worker 避免并发改同一分区。

真实系统键盘、安全区和供应商账号授权仍需相应真机/账号环境，不以模拟结果替代。本次仅 push 重构分支并更新独立测试服务，不合并 main、不替换生产。停止与清理步骤见 `docs/refactor-preview.md`。

### OpenAPI 导入边界

`server/modules/settings/openApiToken.ts` 负责独立 Token 凭据持久化，`server/modules/books/` 负责受限 ZIP/XML 元数据读取及 EPUB 入库；`server/modules/settings/tokenRoutes.ts` 负责设置管理和版本化 HTTP transport，由 `server/app.ts` 统一装配。`/api/openapi/*` 在通用 middleware 中强制 Bearer 鉴权，不接受登录 Cookie 作为替代；Token 不授权其他 `/api/*` 路由。设置管理沿用本地/远程登录边界，并要求同源请求与自定义请求头。

导入复用受限流式文件写入和 `mutatePersistedState` 队列，失败清理 EPUB 与封面；状态至少提升到已有版本 25，以复用服务端书籍生命周期合并保护。未新增 LearningState 字段或状态分区。Token 文件独立于 `state.json`，保留明文以供已授权设置页生成 MCP 配置，同时使用摘要校验；浏览器仅在组件内存中使用凭据。

### MCP HTTP 直连

`server/modules/books/mcp.ts` 使用官方 MCP SDK 注册书架工具及 Zod 参数校验；`server/modules/books/mcpRoutes.ts` 通过 Web Standard Streamable HTTP transport 接入 Hono，按请求创建无会话服务并在响应完成后释放。鉴权复用 OpenAPI middleware，设置与私有 API 不接受该 Bearer 凭据。

`server/modules/books/catalog.ts` 编排书架查询与书单编辑；写入复用状态队列，已有书单按 `updatedAt` 保留较新版本，避免过时的浏览器快照覆盖 MCP 修改；书单删除仍走现有客户端行为。未新增持久化状态字段或版本。回收站与 EPUB 导入直接复用已有服务。

设置页直接生成 `type: http`、`url` 与 `headers.Authorization` 配置，不再提供 stdio 脚本或脚本下载路由。HTTP MCP 的 `upload_book` 接收文件名与 Base64（最大 10 MiB）；需要客户端自行读取本地文件。大文件继续通过同一 Token 的二进制 HTTP 上传接口（最大 100 MiB），服务端不会读取客户端传入的本地路径。

## AI 供应商 OAuth

`server/modules/ai/oauth.ts` 注册 Pi AI 的 `openai-codex` 与 `kimi-coding` 原生供应商，管理设备码登录、取消、超时和凭据刷新。`server/modules/ai/oauthRoutes.ts` 提供同源、受应用会话保护的状态与授权接口；前端设置 hook 轮询公开状态，UI 提供官方授权链接。浏览器不接收 access/refresh token。

凭据以 0600 权限原子写入独立 `ai-oauth.json`，所有写入和刷新在单服务进程内串行，退出与刷新共用队列；同一数据目录不支持多个服务进程并行写入。SDK 错误可能含供应商响应，因此授权和 OAuth 模型失败使用固定的安全错误消息。

模型配置沿用 `LearningState.openAIConfigs` 和 preferences 分区，增加可选的 `oauthProvider` 字段；缺省仍走现有 API Key 协议。默认值、actions、双方分区映射及合并保留原结构，该扩展无需转换旧数据，因此引入时 store version 保持 32；迁移测试覆盖旧配置与 OAuth 配置保留。OAuth 模型使用 SDK 原生目录，任务仍由 PiAgent 执行并保留工具调用上限与服务端持久化。

## 运行机器信息

`server/modules/settings/systemInfo.ts` 通过 Node.js `os` 读取运行环境信息，`server/modules/settings/systemInfoRoutes.ts` 提供只读的 `/api/settings/system-info` 接口，由 `server/app.ts` 在统一认证 middleware 之后挂载。返回主机名、操作系统、架构、CPU、内存、Node.js 版本和非回环网卡 IP，不返回 MAC 地址或环境变量，也不查询外部服务。数据按请求读取，不写入 LearningState。设置页的 `AboutSettings` 在进入“关于”或手动刷新时请求，离开页面时取消请求；远程访问沿用会话认证。

### 全书知识地图

`server/modules/ai/generation/knowledgeMap.ts` 从现有 Foliate 正文索引读取全部段落，在 Pi AI 所选 OAuth 运行时中顺序分析、分层汇总，再交给 `server/modules/ai/generation/codexImage.ts` 调用固定的 Codex Responses 生图端点。该适配器复用 Pi OAuth 刷新，不返回凭据；SSE 有大小限制、超时、取消和完成状态检查，供应商原始错误不会写入对话或日志。生图与书籍分析都只向读者当前选择的 ChatGPT/Codex 账号发送，不为其他供应商隐式启用。

PiAgent 的 `generate_book_knowledge_map` 是读书领域工具，每次用户请求至多执行一次；阶段变化使用现有任务流展示。生成结果由服务端确定性追加到最终对话，保留原图 URL、分析正文和覆盖范围。PNG 保存在独立的 knowledge-maps 文件目录中，写入与书籍删除状态串行校验；读取走现有认证 middleware，删除走书籍文件清理。对话沿用 conversations 分区，无新顶层字段与 store 迁移。

### 信息图结构规划与生图

`server/modules/ai/generation/infographic.ts` 提供 `plan_infographic` 和 `generate_infographic`，仅在阅读任务选择 `openai-codex` 时挂载。方案使用 TypeBox schema 限定标题、目的、布局、节点、关系、出处、限制和样式，并校验节点唯一性和关系引用；生成时必须携带当前请求最新方案的随机 ID。方案仅保留在任务内存中，其可读文本与图片结果通过现有消息流写入 conversations 分区，不增加 Zustand 字段或迁移。

规划阶段先发布可读方案，生图复用 `codexImage.ts` 与 `saveKnowledgeMap` 的鉴权、取消、超时、原子写入和删除竞态保护。并行的重复生图调用共享同一个 Promise，包括失败结果；与全书地图共用单次尝试额度，禁止失败后切换工具自动重试。服务端直接发布最终图片消息，成功后结束 Agent 轮次，避免依赖模型重新输出图片 URL。前端复用既有快捷提示词、Semi AI Chat 和图片查看器。

`server/modules/ai/generation/presets.ts` 集中维护六种预设的问题类型、图示规则与内容约束，同时供 Agent 指令、规划 schema 和实际绘图 Prompt 使用。Agent 结合读者问题选择 `preset` 并填写理由，不做关键词硬匹配。节点必须声明原文/概括/解释类型及来源 ID，原文文字须匹配所引用来源片段；来源唯一性、引用完整性和内容容量在服务端校验。内容稿先发布，生图时由预设规则和该份内容稿构成绘图 Prompt；未采用的子主题仅作为后续拆图建议，不自动触发多张付费生成。

### 书籍图片资源库

`server/modules/books/resources.ts` 管理书籍级图片收藏清单，通过 `bookRoutes` 的 `/api/books/:bookId/resources` 提供列表、保存与移除接口；`PATCH /api/books/:bookId/resources/:imageId` 仅更新已收藏图片的标题。标题经 schema 校验并去除首尾空白，不允许空值或超过 200 字，重命名保留原图、收藏顺序和时间。只接受当前书籍目录内已存在的图片 UUID，服务端构造图片 URL；保存按 UUID 幂等。清单以版本化 JSON 原子写入图片目录，权限为 0600，目录为 0700。写入复用 `mutatePersistedState` 的串行队列并检查书籍有效性，避免与书籍删除产生孤立数据。清单损坏时返回失败，不覆盖旧文件。

资源清单由服务端独立管理，不参与客户端状态快照，因此无需新增 `LearningState`、分区映射、store version 或迁移，旧书籍默认空列表。彻底删除复用现有图片目录清理。前端由 书籍详情页的资源上下文管理当前书籍列表，通用聊天组件仅提供可选图片组件接口，不依赖书籍详情页的私有实现。图片预览复用 `ExpandableImage` 的移动端返回与全屏交互。
