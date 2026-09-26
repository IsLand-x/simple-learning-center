# Learning Center 架构

## 运行形态与技术栈

保持一个 React 18/TypeScript/Vite 浏览器应用、一个 Node.js/Hono 进程和独立用户数据目录。Semi Design/Icons、Allotment、Foliate.js、Zustand persist、Tiptap、PiAgent/Pi AI 和现有文件存储协议继续使用；没有引入数据库或第二套服务端状态缓存。

前端输出 `dist/`；后端使用 `tsconfig.server.json` 编译为 Node ESM，输出 `server-dist/`。`scripts/build-server.mjs` 只清理该生成目录，防止旧迁移产物残留。服务端测试运行编译产物，开发、E2E、preview 和 Docker 使用同一服务入口。`contracts/domain.d.ts` 提供双方共用的纯类型，构建不会把服务器实现引入浏览器。

## 前端目录

```text
src/
  components/           跨页面复用：ai、reading、notes、layout 与基础 UI
  layout/               外壳、登录、侧栏、路由、鉴权恢复与 PWA 启动
  pages/
    books/list/         书架、书单、导入、回收站
    books/detail/       EPUB 阅读、标注、学习面板、资源库
    rss/reader/         订阅源、文章、日报、时间线
    videos/study/       视频资料、字幕、学习笔记
    settings/           模型、内容源、授权、账号与关于
  api/                  按业务域组织的 API class、单例与统一传输原语
  types/                按业务域组织的请求/响应 DTO 与传输结果类型
  util/                 AI、EPUB、阅读样式、持久化与基础工具
  styles/               Tailwind 入口、全局基准与必要兼容样式
```

每个业务页面有 `index.tsx`、`components/` 和按需使用的 `store/`。index 连接页面共享状态并组装组件；store 只收纳跨子组件的状态、业务编排和纯 model。组件可以拥有自己的 useState/useEffect；较复杂的私有逻辑放在组件同级的 useX.ts。只保存两个页签字段的设置页直接用局部状态，登录输入也直接留在登录组件，避免空壳 hook。

组件归属按实际页面消费者判断，包含通过共享组件产生的间接复用。单页专用适配器留在该页，不在根 components 包装或转发；页面直接使用真实共享组件，不再建立只返回另一个组件的空壳。

例如书籍详情页的组件与状态按下面的归属组织，不为了凑目录给每个组件建立 store：

```text
pages/books/detail/
  index.tsx                         连接页面状态并组装布局
  components/
    DemoReader.tsx
    useDemoReader.ts                DemoReader 私有的复杂交互
    right-panel/
      AiConversationPanel.tsx
      useReaderConversation.ts     会话面板私有编排
      useReaderConversationJobs.ts 私有任务订阅与恢复
  store/
    useReaderPageStore.tsx          目录、正文与辅助栏共享的页面状态
    hooks/                         页面级生命周期与布局编排
    model/                         不依赖 UI 的计算和模型
```

共享组件直接从根目录导入，如阅读页与设置页共用 `components/ai/ReaderAiSettingsForm.tsx`，RSS 与视频共用 `components/ai/ContentConversationPanel.tsx`。页面不再用同名转发文件隐藏真实归属。


页面 store 并非另一个持久化实例。所有用户数据继续通过 `util/state/useLearningStore.ts` 的单一 Zustand 核心及原有 actions 保存。新增字段仍须检查 LearningState、默认值、actions、两端分区映射、迁移、合并和测试。

Reader 的真实 Foliate 与演示正文分别由组件承载，宿主只选择适配器；AI 展示与任务订阅/恢复分开。共享聊天组件不深层导入某一个业务页面。RSS 文章处理留在本页 store；Reader/RSS 共用的阅读样式在 util/reading 与 components/reading 中。

## 依赖边界

- layout 组合页面与共享能力；页面不导入其他页面的私有文件。
- components 只复用公共 UI、API、util 和契约，不导入 pages/layout。
- util 不依赖 components/pages/layout；纯 model 不依赖 UI。
- API class 只依赖 API 内部原语、types 与 contracts；HTTP 请求只在 API 层发起。types 不反向依赖运行时实现。
- contracts 不依赖前后端实现；客户端与服务器通过 HTTP/DTO 连接。
- store 的分区传输适配不反向导入 store；需要 rehydrate 的编排有独立入口。
- 服务端 routes 只由 app 装配；业务服务不接收 Hono Context，也不导入 routes。
- 通用 infrastructure 不导入业务 modules；每个业务模块维护自己的规则。

`check:boundaries` 使用 TypeScript AST 与模块解析，检查静态/动态导入、重导出、路径引用和循环依赖。页面私有类型不会通过共享组件反向泄漏。不同页面复用同一控件时，将真正共享部分移入 components，而不借由导入另一页面实现来复用。

## API 与传输类型

`api/` 按 auth、books、reading、rss、videos、ai、settings、state 划分 class，并导出供组件和页面调用的实例。请求构造、URL、HTTP 方法、状态码处理、JSON 解析、认证错误、AbortSignal 与 SSE 解析都在该层完成；hook 负责加载状态、任务生命周期与用户交互。

`types/` 按同一业务范围维护请求体和响应体类型，复用共享领域实体而不复制实体定义。空响应显式返回 void，二进制和可缺失文件有明确类型，状态分区的 200/204/304 与 ETag 使用可区分的结果，流式任务事件使用明确 payload 类型。业务调用方不接收待自行解析的 Response，也不重复拼 URL 或 JSON.stringify 请求体。

## Tailwind 与样式

普通组件使用静态 Tailwind utilities，继续引用 Semi 语义颜色、圆角和 reader 主题变量；不要拼接编译器无法识别的动态类名。原语义 class 暂保留为自动化选择器和第三方覆盖锚点，不代表每个 class 都有独立 CSS 规则。

`styles/index.css` 加载 Tailwind theme/preflight，utilities 与既有受限覆盖共享普通级联。保留 CSS 的范围包括 Semi 内部 DOM、EPUB/富文本内容、复杂选择器、伪元素、原生滚动条、安全区及确需顺序控制的兼容规则。迁移中特别检查 shorthand/longhand 与相互重叠的媒体查询，受原有分组选择器影响的属性整组保留，不能用调整类名顺序猜测最终 CSS 顺序。`mobile:` 自定义 variant 精确采用 `max-width: 800px`，与运行时媒体查询一致。

应用外壳与阅读纸张主题相互独立；动态位置和阅读主题可用 inline style。断点、触控尺寸、焦点、reduced motion、portal 层级和 CSS 原有覆盖顺序仍遵循 AGENTS.md。样式变更以迁移前视觉基线验收，不以更新截图方式接受未授权改版。

## 状态与同步

persist key 仍是 `learning-center-state-v1`，store version 仍是 33。library、reading、conversations、rss、videos、preferences 六个服务端状态分区不变，顶层路由继续 lazy loading 与 StateDomainGate。

后端 `modules/state/repository` 保持唯一状态写队列；`state/sync` 编排 AI、RSS、Reader 保护，repository 保留旧快照、删除墓碑、已读、书单与文件外置等规则的既有顺序。不能让各业务模块各自覆盖 state.json。

EPUB、索引、Markdown 笔记、封面、图片和凭据继续保存在既有数据目录。API Key/OAuth/来源Cookie不进入源码、构建或日志。旧浏览器存储只用于首次迁移，日常持久化以服务端为准。

Reader AI活动provider仍独立于面板显隐；任务在页面关闭后继续运行，SSE断开只取消前端订阅。会话消息的readAt沿用conversations分区，较新已读时间与删除结果受保护。服务重启仍可能中断内存AI任务，这次结构重构没有改变该限制。

## 后端模块

`server/app.ts` 创建共享依赖、挂载middleware和Hono子应用，`server/index.ts` 管理进程与调度器；routes负责请求映射、输入限制和响应协议。

业务实现聚合在 `server/modules/{library,reading,rss,videos,ai,knowledgeMaps,auth,credentials,state}`。AI任务按状态管理、输入准备、执行、结果写回、日报和模型拆分；平台请求、文件原语与HTTP错误分别有明确落点。`infrastructure/fs/files` 保留私有权限、路径约束、流式写入及原子文件操作。

Hono子应用在路由定义完成后挂载，保持原有方法、路径、注册顺序、405/404兜底、Cookie、ETag、缓存与SSE语义。路由契约测试固定87条注册记录；既有服务端测试验证实际响应和数据保护，而非只检查路径字符串。

## Foliate 兼容边界

`pages/books/detail/components/foliate/**`、`FoliateEpubReader.tsx`、`util/epub/foliateReader.ts` 和 `vite.config.ts` 共同维护CFI、导航队列、Paginator、Overlayer、iframe通道与源码变换。生命周期仍按book.id建立，其余最新值通过稳定ref提供，不能扩大Hooks例外。

这轮只改变文件组织与职责，不改动Foliate的分页、手势和源码变换算法。除了演示正文测试，还使用原创EPUB夹具验证真实Foliate目录、分页与CFI刷新恢复。

## 验证与发布

`npm run verify` 包含lint零warning、格式、边界、Knip、Web/Node单测、前后端类型与Vite/PWA构建。`verify:full` 再通过固定版本的测试容器执行 Playwright；所有E2E使用一个临时示例数据服务，因此workers固定为1，防止用例并行写同一分区。

视觉测试使用迁移前基线，覆盖登录与五个业务页面、四种宽度、两种主题，共 48 张截图；另有真实 RSS/视频持久化与 Foliate 专项。截图和夹具说明位于 `tests/e2e/README.md`。真实系统键盘、安全区、系统返回和供应商账号授权仍需人工环境验证，不能用桌面模拟宣称真机全面覆盖。

本次只push重构分支，独立测试服务使用新的示例数据卷和凭据；不合并main，不替换生产容器。预览交付和停止/清理步骤见 `docs/refactor-preview.md`。

### OpenAPI 导入边界

`server/modules/credentials/openApiToken.ts` 负责独立 Token 凭据持久化，`server/modules/library/` 负责受限 ZIP/XML 元数据读取及 EPUB 入库；`server/routes/openApiRoutes.ts` 负责设置管理和版本化 HTTP transport，由 `server/app.ts` 统一装配。`/api/openapi/*` 在通用 middleware 中强制 Bearer 鉴权，不接受登录 Cookie 作为替代；Token 不授权其他 `/api/*` 路由。设置管理沿用本地/远程登录边界，并要求同源请求与自定义请求头。

导入复用受限流式文件写入和 `mutatePersistedState` 队列，失败清理 EPUB 与封面；状态至少提升到已有版本 25，以复用服务端书籍生命周期合并保护。未新增 LearningState 字段或状态分区。Token 文件独立于 `state.json`，保留明文以供已授权设置页生成 MCP 配置，同时使用摘要校验；浏览器仅在组件内存中使用凭据。


### MCP HTTP 直连

`server/modules/library/mcp.ts` 使用官方 MCP SDK 注册书架工具及 Zod 参数校验；`server/routes/mcpRoutes.ts` 通过 Web Standard Streamable HTTP transport 接入 Hono，按请求创建无会话服务并在响应完成后释放。鉴权复用 OpenAPI middleware，设置与私有 API 不接受该 Bearer 凭据。

`server/modules/library/service.ts` 编排书架查询与书单编辑；写入复用状态队列，已有书单按 `updatedAt` 保留较新版本，避免过时的浏览器快照覆盖 MCP 修改；书单删除仍走现有客户端行为。未新增持久化状态字段或版本。回收站与 EPUB 导入直接复用已有服务。

设置页直接生成 `type: http`、`url` 与 `headers.Authorization` 配置，不再提供 stdio 脚本或脚本下载路由。HTTP MCP 的 `upload_book` 接收文件名与 Base64（最大 10 MiB）；需要客户端自行读取本地文件。大文件继续通过同一 Token 的二进制 HTTP 上传接口（最大 100 MiB），服务端不会读取客户端传入的本地路径。

## AI 供应商 OAuth

`server/modules/ai/oauth.ts` 注册 Pi AI 的 `openai-codex` 与 `kimi-coding` 原生供应商，管理设备码登录、取消、超时和凭据刷新。`server/routes/aiOAuthRoutes.ts` 提供同源、受应用会话保护的状态与授权接口；前端设置 hook 轮询公开状态，UI 提供官方授权链接。浏览器不接收 access/refresh token。

凭据以 0600 权限原子写入独立 `ai-oauth.json`，所有写入和刷新在单服务进程内串行，退出与刷新共用队列；同一数据目录不支持多个服务进程并行写入。SDK 错误可能含供应商响应，因此授权和 OAuth 模型失败使用固定的安全错误消息。

模型配置沿用 `LearningState.openAIConfigs` 和 preferences 分区，增加可选的 `oauthProvider` 字段；缺省仍走现有 API Key 协议。默认值、actions、双方分区映射及合并保留原结构，该扩展无需转换旧数据，因此引入时 store version 保持 32；迁移测试覆盖旧配置与 OAuth 配置保留。OAuth 模型使用 SDK 原生目录，任务仍由 PiAgent 执行并保留工具调用上限与服务端持久化。

## 运行机器信息

`server/app/systemInfo.ts` 通过 Node.js `os` 读取运行环境信息，`server/routes/systemInfoRoutes.ts` 提供只读的 `/api/settings/system-info` 接口，由 `server/app.ts` 在统一认证 middleware 之后挂载。返回主机名、操作系统、架构、CPU、内存、Node.js 版本和非回环网卡 IP，不返回 MAC 地址或环境变量，也不查询外部服务。数据按请求读取，不写入 LearningState。设置页的 `AboutSettings` 在进入“关于”或手动刷新时请求，离开页面时取消请求；远程访问沿用会话认证。

### 全书知识地图

`server/modules/knowledgeMaps/service.ts` 从现有 Foliate 正文索引读取全部段落，在 Pi AI 所选 OAuth 运行时中顺序分析、分层汇总，再交给 `server/modules/ai/codexImage.ts` 调用固定的 Codex Responses 生图端点。该适配器复用 Pi OAuth 刷新，不返回凭据；SSE 有大小限制、超时、取消和完成状态检查，供应商原始错误不会写入对话或日志。生图与书籍分析都只向读者当前选择的 ChatGPT/Codex 账号发送，不为其他供应商隐式启用。

PiAgent 的 `generate_book_knowledge_map` 是读书领域工具，每次用户请求至多执行一次；阶段变化使用现有任务流展示。生成结果由服务端确定性追加到最终对话，保留原图 URL、分析正文和覆盖范围。PNG 保存在独立的 knowledge-maps 文件目录中，写入与书籍删除状态串行校验；读取走现有认证 middleware，删除走书籍文件清理。对话沿用 conversations 分区，无新顶层字段与 store 迁移。

### 信息图结构规划与生图

`server/modules/knowledgeMaps/infographic.ts` 提供 `plan_infographic` 和 `generate_infographic`，仅在阅读任务选择 `openai-codex` 时挂载。方案使用 TypeBox schema 限定标题、目的、布局、节点、关系、出处、限制和样式，并校验节点唯一性和关系引用；生成时必须携带当前请求最新方案的随机 ID。方案仅保留在任务内存中，其可读文本与图片结果通过现有消息流写入 conversations 分区，不增加 Zustand 字段或迁移。

规划阶段先发布可读方案，生图复用 `codexImage.ts` 与 `saveKnowledgeMap` 的鉴权、取消、超时、原子写入和删除竞态保护。并行的重复生图调用共享同一个 Promise，包括失败结果；与全书地图共用单次尝试额度，禁止失败后切换工具自动重试。服务端直接发布最终图片消息，成功后结束 Agent 轮次，避免依赖模型重新输出图片 URL。前端复用既有快捷提示词、Semi AI Chat 和图片查看器。

`server/modules/knowledgeMaps/presets.ts` 集中维护六种预设的问题类型、图示规则与内容约束，同时供 Agent 指令、规划 schema 和实际绘图 Prompt 使用。Agent 结合读者问题选择 `preset` 并填写理由，不做关键词硬匹配。节点必须声明原文/概括/解释类型及来源 ID，原文文字须匹配所引用来源片段；来源唯一性、引用完整性和内容容量在服务端校验。内容稿先发布，生图时由预设规则和该份内容稿构成绘图 Prompt；未采用的子主题仅作为后续拆图建议，不自动触发多张付费生成。

### 书籍图片资源库

`server/modules/knowledgeMaps/resources.ts` 管理书籍级图片收藏清单，通过 `bookRoutes` 的 `/api/books/:bookId/resources` 提供列表、保存与移除接口；`PATCH /api/books/:bookId/resources/:imageId` 仅更新已收藏图片的标题。标题经 schema 校验并去除首尾空白，不允许空值或超过 200 字，重命名保留原图、收藏顺序和时间。只接受当前书籍目录内已存在的图片 UUID，服务端构造图片 URL；保存按 UUID 幂等。清单以版本化 JSON 原子写入图片目录，权限为 0600，目录为 0700。写入复用 `mutatePersistedState` 的串行队列并检查书籍有效性，避免与书籍删除产生孤立数据。清单损坏时返回失败，不覆盖旧文件。

资源清单由服务端独立管理，不参与客户端状态快照，因此无需新增 `LearningState`、分区映射、store version 或迁移，旧书籍默认空列表。彻底删除复用现有图片目录清理。前端由 书籍详情页的资源上下文管理当前书籍列表，通用聊天组件仅提供可选图片组件接口，不依赖书籍详情页的私有实现。图片预览复用 `ExpandableImage` 的移动端返回与全屏交互。
