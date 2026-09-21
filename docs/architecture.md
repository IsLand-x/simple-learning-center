# Learning Center 架构

## 技术栈

- Web：React 18、TypeScript、React Router、Vite 8 与 `vite-plugin-pwa`。
- UI：Semi Design、Semi Icons、Allotment；样式使用有作用域的语义 class 与 Semi token。
- 阅读：Foliate.js 负责运行时渲染、分页、手势、标注和搜索位置，epub.js 仅处理导入元数据与封面。
- 状态：单一 Zustand store、`persist`、服务端分区同步与显式版本迁移。
- 服务：Node.js、Hono、内置文件系统/HTTP API、PiAgent 与 Pi AI。
- 验证：ESLint、Prettier、Vitest、Testing Library、Node test、Playwright、TypeScript 与 Vite/PWA build。

## 代码风格

- TypeScript 保持严格类型，领域模型优先使用明确 interface/type，不以 `any` 绕过边界。
- React 页面负责组合，副作用进入 feature application/hook，纯计算进入 model，展示组件通过 props 获取数据。
- class 沿用 `block__element--modifier`，全局样式覆盖必须由功能父 class 限定；动态坐标和主题变量才使用 inline style。
- 状态变更通过现有 store actions，异步数据经现有 API client；禁止为同一数据建立平行状态源。
- 服务端 route 只做 HTTP 映射、限制和依赖调用；文件、远端请求、AI 与领域保护保留在各自模块。
- 文件名按导出职责命名，公共入口稳定，内部模块避免循环依赖和跨 feature 深层引用。

## 部署边界

Learning Center 是本地优先的模块化单体：浏览器运行 React 应用，Node/Hono 进程同时提供静态资源、单用户认证、数据 API、内容源抓取、AI 任务和调度器。生产数据始终位于独立的 `data/` 目录。

```text
Browser
  React routes -> feature UI/model -> Zustand domain slices
        |                                  |
        +---------- same-origin API -------+
                           |
Node/Hono routes -> domain services -> filesystem / remote sources / PiAgent
```

## 前端模块

- `src/app/`：应用启动、路由与应用级组合，不承载领域规则。
- `src/features/<domain>/`：领域模型、hooks、应用动作和展示组件。
- `src/store/`：唯一全局 store 的组合入口、领域 actions、默认值、迁移与合并。
- `src/components/`：仍被多个功能复用的稳定组件与兼容入口。
- `src/lib/`：API client、EPUB、主题、同步和浏览器基础能力。
- `src/shared/`：没有业务归属且不依赖 feature/store/page 的通用适配器。
- `src/styles.css`：有序加载 `src/styles/` 中的全局样式模块。

`src/styles.css` 只维护有序入口；具体规则写入职责最接近的 `src/styles/*.css`。编号和导入顺序属于级联契约，不能在未验证覆盖关系时重排或跨模块移动规则。

依赖方向以组合层调用领域层为主。`shared` 不得依赖 app、components、页面、feature 或 store；store 不得依赖界面层；不同 feature 不得直接相互导入，共享能力应上移到 shared、lib 或跨功能 components；除 routes 自身外，只有 `server/app.mjs` 可以导入服务端 routes。`npm run check:boundaries` 自动检查静态相对导入，但不得通过动态导入或路径别名绕过这些约束。

## 状态与同步

`src/store/useLearningStore.ts` 是公共入口，内部由 library、reading、conversation、rss、video 和 preference actions 组合。以下契约属于持久化接口，不能在普通重构中改变：

- persist key：`learning-center-state-v1`
- store version：由 `LEARNING_STORE_VERSION` 定义
- 六个服务端状态分区及其字段
- 高亮、阅读样式和布局的时间戳合并规则
- 删除墓碑与跨设备旧快照保护

结构发生变化时必须同步更新 `LearningState`、默认值、所属 action、客户端与服务端 `STATE_DOMAIN_FIELDS`、store version、`src/store/persistence/` 中的迁移与合并规则以及对应测试。每个持久化字段必须且只能归属一个状态分区；顶层路由通过 lazy loading 与 `StateDomainGate` 激活所需分区。服务端仍负责最终的状态保护和原子写入。

阅读页的 `ReaderAiActivityProvider` 按书籍追踪任务，生命周期独立于桌面 AI 面板与移动抽屉；创建中的请求、服务端运行状态与最终回复由同一上下文向各入口提供，面板重新挂载时接回最新任务。SSE 断开只停止前端订阅，不取消服务端任务。

会话回复的 `ChatMessage.readAt` 仍归属 conversations 分区的 `chats`，不新增顶层字段或分区；默认消息不含已读时间。store version 33 将旧助手回复迁移为已读，客户端合并和 `server/chatReadState.mjs` 保留同一消息较新的已读时间，删除消息不复活。面板可见、文档在前台且滚动到末尾才记录已读。

## 服务端模块

- `server/app.mjs`：创建应用、构造依赖并按稳定顺序挂载模块。
- `server/app/`：通用 HTTP 响应、错误边界和认证 middleware。
- `server/routes/`：HTTP transport，只处理请求映射与领域服务调用。
- `server/storage.mjs`：文件系统 repository 与原子读写。
- `server/*State.mjs`、内容源和 AI 模块：领域保护和应用服务。
- `server/index.mjs`：进程启动与调度器生命周期。

路由拆分不能改变路径、方法、状态码、响应体、Cookie、ETag、缓存头或 SSE 事件。外部 URL 仍必须经过 SSRF 防护，密钥和 Cookie 不得写入普通状态响应或日志。

## 高风险适配器

`src/features/reader/foliate/**`、`src/components/FoliateEpubReader.tsx`、`src/lib/foliateReader.ts` 和 `vite.config.ts` 共同构成 Foliate 兼容边界。生命周期按 `book.id` 重建，其余最新值通过稳定 ref 输入；不能为了消除 Hooks 提示加入会反复销毁阅读器的易变依赖，也不能扩大现有 lint 例外。

CFI、导航队列、Paginator、Overlayer、iframe 样式注入和 Vite Foliate 源码变换必须作为整体维护。升级 Foliate.js 或修改任何一层时，必须同时验证精确位置恢复、章节边界、移动选区、持久高亮和桌面 Chromium Blob iframe。

## 验证

```bash
npm run lint
npm run format:check
npm run check:boundaries
npm run check:dead-code
npm test
npm run build
npm run test:e2e
```

`npm run verify` 执行不依赖浏览器的提交门禁；`npm run verify:full` 额外运行隔离数据目录下的桌面与移动 Chrome 回归。

Web 单元测试位于 `src/**/*.test.{ts,tsx}`，Node 服务端测试当前位于 `server/*.test.mjs`，Playwright E2E 位于 `tests/e2e/`。lint 保持 0 warning；TypeScript 拒绝未使用局部变量和参数；Knip 检查不可达文件、无消费者导出和未使用依赖。新增或重构目录必须纳入 `format:check`，独立运行入口必须在 `knip.json` 中精确登记。

`knip.json` 中的 `scripts/start-e2e-server.mjs` 由 Playwright `webServer` 间接启动，`public/server/index.js` 是 Sites/Cloudflare 托管入口；两者不是应用静态 import 图的一部分，因此作为独立入口登记。

### OpenAPI 导入边界

`server/openapi/` 负责独立 Token 凭据持久化、受限 ZIP/XML 元数据读取及 EPUB 入库；`server/routes/openApiRoutes.mjs` 负责设置管理和版本化 HTTP transport，由 `server/app.mjs` 统一装配。`/api/openapi/*` 在通用 middleware 中强制 Bearer 鉴权，不接受登录 Cookie 作为替代；Token 不授权其他 `/api/*` 路由。设置管理沿用本地/远程登录边界，并要求同源请求与自定义请求头。

导入复用受限流式文件写入和 `mutatePersistedState` 队列，失败清理 EPUB 与封面；状态至少提升到已有版本 25，以复用服务端书籍生命周期合并保护。未新增 LearningState 字段或状态分区。Token 文件独立于 `state.json`，保留明文以供已授权设置页生成 MCP 配置，同时使用摘要校验；浏览器仅在组件内存中使用凭据。


### MCP HTTP 直连

`server/mcp/server.mjs` 使用官方 MCP SDK 注册书架工具及 Zod 参数校验；`server/routes/mcpRoutes.mjs` 通过 Web Standard Streamable HTTP transport 接入 Hono，按请求创建无会话服务并在响应完成后释放。鉴权复用 OpenAPI middleware，设置与私有 API 不接受该 Bearer 凭据。

`server/mcp/library.mjs` 编排书架查询与书单编辑；写入复用状态队列，已有书单按 `updatedAt` 保留较新版本，避免过时的浏览器快照覆盖 MCP 修改；书单删除仍走现有客户端行为。未新增持久化状态字段或版本。回收站与 EPUB 导入直接复用已有服务。

设置页直接生成 `type: http`、`url` 与 `headers.Authorization` 配置，不再提供 stdio 脚本或脚本下载路由。HTTP MCP 的 `upload_book` 接收文件名与 Base64（最大 10 MiB）；需要客户端自行读取本地文件。大文件继续通过同一 Token 的二进制 HTTP 上传接口（最大 100 MiB），服务端不会读取客户端传入的本地路径。

## AI 供应商 OAuth

`server/aiAuth/service.mjs` 注册 Pi AI 的 `openai-codex` 与 `kimi-coding` 原生供应商，管理设备码登录、取消、超时和凭据刷新。`server/routes/aiOAuthRoutes.mjs` 提供同源、受应用会话保护的状态与授权接口；前端设置 hook 轮询公开状态，UI 提供官方授权链接。浏览器不接收 access/refresh token。

凭据以 0600 权限原子写入独立 `ai-oauth.json`，所有写入和刷新在单服务进程内串行，退出与刷新共用队列；同一数据目录不支持多个服务进程并行写入。SDK 错误可能含供应商响应，因此授权和 OAuth 模型失败使用固定的安全错误消息。

模型配置沿用 `LearningState.openAIConfigs` 和 preferences 分区，增加可选的 `oauthProvider` 字段；缺省仍走现有 API Key 协议。默认值、actions、双方分区映射及合并保留原结构，该扩展无需转换旧数据，因此引入时 store version 保持 32；迁移测试覆盖旧配置与 OAuth 配置保留。OAuth 模型使用 SDK 原生目录，任务仍由 PiAgent 执行并保留工具调用上限与服务端持久化。

## 运行机器信息

`server/app/systemInfo.mjs` 通过 Node.js `os` 读取运行环境信息，`server/routes/systemInfoRoutes.mjs` 提供只读的 `/api/settings/system-info` 接口，由 `server/app.mjs` 在统一认证 middleware 之后挂载。返回主机名、操作系统、架构、CPU、内存、Node.js 版本和非回环网卡 IP，不返回 MAC 地址或环境变量，也不查询外部服务。数据按请求读取，不写入 LearningState。设置 feature 的 `AboutSettings` 在进入“关于”或手动刷新时请求，离开页面时取消请求；远程访问沿用会话认证。
