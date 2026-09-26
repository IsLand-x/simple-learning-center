# Learning Center 全面重构调研与方案

> 状态：已获准实施；前端结构和 Tailwind 以用户后续指示为准。调研日期：2026-09-26。代码基线：`8f9ed13`。
>
> 本文依据当前源码、依赖声明、测试配置及现有文档编写。本文原调研轮仅做静态调研和方案设计；以下“现有功能”表示源码和文档中的实现范围，不代表本轮已实测通过。

## 用户确认后的调整

用户明确选择 `components / layout / pages / util / styles`，每个子页面含 `index.tsx / components / store`，页面入口只负责组装，Tailwind 优先。后续要求自主完成验证后 push 当前分支，部署独立测试实例，不合并 main。下文保留原调研供理解取舍，实际落地架构以 [architecture.md](../architecture.md) 为准。

## 1. 原始调研结论

建议继续采用**单仓库、模块化单体、前后端 TypeScript、React + Hono、本地文件持久化**，以业务边界重新组织内部实现，分批替换，不进行一次性推倒重写。

这次重构的目标应当是：以后修改 RSS、阅读器或 AI 的某个行为时，可以准确找到负责它的模块，并通过明确接口影响其他模块；用户看到的页面、操作、数据和服务行为保持一致。

具体建议：

1. 保留 React、Semi Design、Allotment、Foliate、Zustand、Vite、Hono 和现有数据格式，不在同一轮升级核心框架或更换 UI 库。
2. 后端逐步由 `.mjs` 迁移到严格检查的 TypeScript；使用 Hono 子应用组织路由，业务实现按模块分组。
3. 前端延续现有 `features/<业务>`，补齐业务代码归属，收缩大页面、顶层 `components` 和平铺的 `lib`。
4. 区分业务模块、跨业务能力、无业务含义的基础工具；共享代码也必须有明确职责。
5. 保留唯一 Zustand store、六个状态分区与服务端写入队列，不把目录重构变成数据架构重写。
6. 先建立行为和视觉基线，再逐模块迁移；每一批都必须可验证、可回退。

“全面”指覆盖整个项目的职责与依赖治理，不要求一次提交改完全部文件。文件总数可能增加，但寻找代码和理解调用关系应更容易。

## 2. 当前有哪些功能

### 2.1 用户可见功能清单

| 功能范围 | 当前能力 | 主要实现入口 |
| --- | --- | --- |
| 应用外壳 | 桌面侧栏、移动底栏、明暗主题、PWA、远程登录、状态恢复与按路由加载 | `src/App.tsx`、`src/app/`、`AppSidebar`、`StateDomainGate` |
| 书架 | EPUB 批量导入、封面、搜索与阅读状态筛选、书单管理及排序、回收站和恢复 | `LibraryPage`、`features/library/`、`libraryActions` |
| EPUB 阅读 | 分页、目录、CFI 精确定位、进度恢复、键盘/触屏/触控板导航、可调整分栏、移动沉浸模式 | `ReaderPage`、`ReaderSurface`、`features/reader/foliate/` |
| 阅读样式 | 字体、字号、纸张与文字颜色、主题预设、纹理、密度；阅读样式独立于应用主题 | `ReaderToolbar`、`lib/readerThemes.ts`、`lib/readerFonts.ts` |
| 阅读记录与标注 | 高亮、评论、Markdown 笔记、阅读时长、轨迹、预计剩余时间、目录跳转后回到原位置 | reader 的 hooks、右侧面板、store reading actions |
| AI 学习 | 多供应商/模型、推理强度、引用提问、思考与工具过程、后台生成、恢复会话、取消任务、未读回复提示 | reader AI 面板、`RssAiPanel`、`lib/aiJobs.ts`、`server/aiJobs.mjs` |
| AI 工具与图片 | 书内搜索和段落读取、笔记读写、联网搜索与网页读取、全书知识地图、信息图、图片资源收藏和重命名 | `server/aiChat.mjs`、`aiBookSearch`、`aiNotes`、`knowledgeMaps/` |
| RSS | RSS/Atom/RDF、文件夹与拖动排序、OPML、聚合列表、搜索、已读/收藏、时间线、URL 恢复、正文目录与图片预览 | `RssPage`、`features/rss/`、RSS actions 与服务 |
| RSS 学习 | 高亮/评论、引用提问、自动摘要、网页原文、中文翻译、日报和定时执行记录 | RSS application hooks、`rssArticle`、`rssTranslation`、`rssDigestScheduler` |
| 内容来源 | B站每周必看、UP 主投稿、YouTube 频道 Feed、平台视频嵌入、来源凭据和错峰刷新 | `rssSources`、`bilibiliFeeds`、`youtubeFeeds`、`sourceSecrets` |
| 视频学习 | YouTube 导入、按频道分组、播放器、原文/中文/双语字幕、时间点跳转与笔记、Markdown 笔记、AI | `VideoStudyPage`、`features/video/`、`YouTubePlayer`、`youtubeVideo` |
| 设置 | 模型、AI 默认行为、搜索服务、内容源凭据、OAuth、账号、OpenAPI/MCP 配置、系统信息 | `SettingsPage`、`features/settings/` |
| 外部接入 | 独立 Bearer Token、EPUB 导入 API、HTTP MCP 书架工具与上传 | `server/openapi/`、`server/mcp/`、对应 routes |

一级导航仍然只有“读书、RSS、视频、设置”。AI、笔记、资源库等是上述业务中的能力，不因此新增一级页面。

### 2.2 同样需要保持的服务端行为

- 浏览器不直接请求模型供应商；AI 任务由服务端执行，关闭页面或 SSE 断开不取消任务。服务重启仍可能中断内存任务，这个限制不能被重构文档误写为已解决。
- RSS 抓取、日报与回收站清理由服务端调度；回收站保留期、去重、错峰和刷新限制需要保持。
- 单用户服务支持本机与认证远程访问。登录 Cookie、OpenAPI Bearer、供应商 OAuth 是不同凭据边界。
- `data/state.json`、EPUB、笔记正文、封面、索引、图片资源及独立凭据文件共同构成持久化数据；不能只验证状态 JSON。
- 状态同步保护较新的已读、进度、样式、标注、书单、AI 回复与删除结果，防止旧浏览器快照覆盖新状态。
- 旧浏览器数据仅用于服务端空目录时的首次迁移，不能恢复成日常 localStorage/IndexedDB 存储。

## 3. 当前代码如何组织，问题在哪里

### 3.1 已有结构值得保留

```text
src/
  app/                 启动、路由
  pages/               页面编排
  features/            library、reader、rss、video、settings
  components/          跨功能组件、业务组件、兼容入口混合
  lib/                 API、同步、阅读样式、内容处理等混合
  shared/              少量通用 UI 与浏览器 hooks
  store/               actions、默认值、迁移、合并、唯一 store 入口
  styles/              按编号加载的全局样式
  types.ts             共享领域类型
server/
  app.mjs              Hono 应用装配
  index.mjs            HTTP 服务与调度器生命周期
  app/                 middleware、HTTP 能力
  routes/              已按业务拆分的路由注册函数
  aiAuth/、openapi/、mcp/、knowledgeMaps/
  *.mjs                其余业务服务、存储、状态规则及测试
```

项目并非完全没有架构。此前的 [`refactor-modular-architecture`](./refactor-modular-architecture/tasks.md) 已记录一轮完成的拆分，当前还有 lazy route、状态分区门禁、模块边界检查和测试。本文是下一阶段方案，不覆盖旧计划，也不把旧计划中的测试结果当成本轮验证结果。

后端已经使用 `new Hono()`，`server/app.mjs` 通过 `registerBookRoutes` 等函数统一装配。需要改进的是业务服务的聚合、依赖显式化和类型检查，而不是再引入一次 Hono。

### 3.2 规模与热点

以下为基线文件的物理行数，包含空行和注释；行数只用于定位审阅热点，不作为机械拆分标准。

| 文件 | 行数 | 主要关注点 |
| --- | ---: | --- |
| `src/pages/RssPage.tsx` | 997 | 页面状态、内容派生、多个副作用、桌面/移动布局与弹层组合 |
| `src/pages/ReaderPage.tsx` | 585 | 导航、选区、评论草稿、会话与面板之间的协调 |
| `src/components/ReaderSurface.tsx` | 650 | 阅读宿主接口、演示正文、选区和高亮相关实现 |
| `src/features/rss/ui/RssPresentation.tsx` | 676 | 文章、日报、目录、右面板与图片查看器集中在同一文件 |
| `src/features/rss/ui/RssToolbars.tsx` | 549 | 来源操作、移动操作、列表头、详情工具栏和辅助栏混合 |
| `src/components/RssAiPanel.tsx` | 539 | 同时导出 RSS 与视频 AI 面板，并包含任务订阅状态 |
| `src/features/reader/ui/right-panel/AiConversationPanel.tsx` | 648 | 聊天 UI 与异步任务、乐观消息、会话行为交织 |
| `src/features/reader/foliate/bindFoliateDocumentInteractions.ts` | 1085 | 鼠标、触摸、选区和 iframe 生命周期强耦合 |
| `server/aiJobs.mjs` | 945 | 多种 AI 任务的创建、状态机、订阅与结果写回 |
| `server/aiChat.mjs` | 824 | 供应商运行时、工具、Prompt、消息转换、流式执行 |
| `server/storage.mjs` | 525 | 原子文件写入、HTTP 请求读取、封面/笔记处理、多领域状态保护 |
| `vite.config.ts` | 865 | 构建配置与大量 Foliate 源码兼容变换混合 |

当前 `src/` 有 194 个文件，`server/` 有 80 个 `.mjs` 文件，其中 22 个是测试文件。因此“后端 JS 文件多”一部分来自测试和合理拆分，不能通过合并文件解决。真正需要消除的是职责不清和依赖分散。

### 3.3 具体结构问题

**业务归属没有完成收口。** RSS 移动工作区、日报设置和 AI 面板仍在顶层 `components`；阅读器布局组件与 feature 内的面板分居两处。开发者需要先知道历史，才能判断去哪个目录找代码。

**文件名与消费者不一致。** `features/video/ui/VideoWorkspace.tsx` 从 `components/RssAiPanel.tsx` 导入 `VideoAiPanel`。它实际上包含跨内容类型的对话能力，文件名却指向 RSS。

**`lib` 混合多个层次。** `format`、`uuid` 是通用工具，`rssContent` 是领域内容处理，`readerThemes` 是跨业务阅读规则，`serverStateStorage` 是持久化适配，`learningStateSync` 则直接使用 store。它们不应该被同一条“所有 lib 都是底层”的规则管理。

**共享能力不能简单塞回单个 feature。** 阅读主题同时被 Reader、RSS、store 默认值和迁移使用。如果直接把它移进 `features/reader`，会造成跨 feature 导入和 store 依赖 feature，违反现有边界。

**后端基础设施夹带领域规则。** `storage.mjs` 包含 RSS、视频、书单等旧快照保护；`stateRoutes.mjs` 直接组合阅读、RSS 和 AI 状态保护。这些应成为有明确顺序的状态同步应用服务。

**类型检查只覆盖部分工程。** 现有 `tsconfig.node.json` 只包含 `vite.config.ts`，后端 `.mjs` 依赖语法检查、ESLint 和测试，没有与前端等强度的 TypeScript 契约检查。

**边界和视觉门禁仍有空缺。** 当前边界脚本主要匹配静态相对导入，尚不完整覆盖动态导入、别名、循环依赖和层内依赖方向。已有 19 个 Web 测试文件、22 个服务端测试文件、11 个 E2E spec，但 E2E 中的截图主要是留存文件，没有 `toHaveScreenshot`/`toMatchSnapshot` 自动对比；现有 CI 和 Docker 构建执行 `verify`，没有执行 `verify:full`。

**文档有轻微漂移。** README 的 feature 概述列出 AI，但当前没有独立 `features/ai`；实际共用能力分布在组件、lib 与服务端。实施后应以最终代码为准更新文档，不能以目录示意代替落实。

## 4. 技术栈建议

| 层次 | 建议 | 理由与边界 |
| --- | --- | --- |
| 前端 | 保留 React 18 + TypeScript + React Router + Vite 8 | 现有功能不需要 SSR 或框架迁移；保持现有 lazy loading |
| UI 与样式 | 保留 Semi Design、Semi Icons、Allotment、语义 CSS | 最大限度保留 DOM、主题 token、分栏与视觉表现 |
| 状态 | 保留 Zustand `persist` 与服务端 storage adapter | 避免引入第二套缓存或改变现有分区同步语义 |
| EPUB | 保留 Foliate.js；epub.js 仅处理导入 | CFI、分页、手势、Overlayer 与 Chromium 兼容需要整体维护 |
| 富文本与拖动 | 保留 Tiptap 和 `@hello-pangea/dnd` | 重构目录不需要替换已形成交互约定的组件 |
| 后端 | Node.js `>=22.19.0` + Hono + `@hono/node-server` + TypeScript | 沿用当前运行与部署模式，补足跨模块类型约束 |
| 持久化 | 保留文件系统、JSON/Markdown/EPUB 与原子写入 | 当前是单用户单进程；暂不引入数据库、ORM、Redis 或队列服务 |
| HTTP 校验 | 优先复用已有 Zod | 处理运行时不可信输入；逐接口保留当前错误码、消息和字段兼容 |
| AI | 保留 PiAgent、Pi AI 与现有工具 schema | 不在结构重构时同时替换 Agent SDK 或强行改写 SDK 所需 schema |
| 测试与质量 | 保留 Node test、Vitest、Testing Library、Playwright、ESLint、Prettier、Knip | 补齐覆盖范围、依赖规则及视觉对比 |

不建议本轮引入 Next.js、NestJS、微服务、Turborepo/Nx、Redux 或另一个服务端状态缓存库。它们没有直接解决当前“职责散落”的问题，反而扩大验证范围。Tailwind 和 Sites 插件虽存在于构建配置中，也不应仅因本轮目录整理就删除；确认独立部署入口与实际用途后另行处理。

### 4.1 后端 TypeScript 的执行方式

建议生产使用 **`tsc` 编译后的 ESM JavaScript + Node**。新增 `tsconfig.server.json`，使用适合 Node ESM 的模块解析配置，独立输出到 `build/server/`；前端继续输出到 `dist/`。Node 模块解析应以实际运行方式配置，不能直接复用前端的 Bundler 设置。[TypeScript 官方模块参考](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-nodenext)

开发可采用 `tsc --watch` 配合 Node 监听编译输出，外层启动脚本先完成首轮编译，再启动服务与 Vite。这样暂不需要增加执行 TypeScript 的运行时依赖。Node 自带类型剥离也不等于类型检查，而且不会按 `tsconfig.json` 完整转换代码，因此不把“能直接执行 .ts”当成类型安全方案。[Node 22 TypeScript 文档](https://nodejs.org/docs/latest-v22.x/api/typescript.html)

迁移注意事项：

- 先在原路径完成 TS 迁移并验证，再迁移业务目录；避免同时重命名、改行为和改变构建方式。
- 过渡期允许 `.mjs` 与 `.ts` 共存，但必须定义可收缩的遗留文件清单；旧文件通过既有测试验证，新文件使用严格类型。不能长期以 `any`、整目录忽略代替迁移。
- 同步调整 dev/start/preview、Docker CMD 与复制路径、E2E 启动器、CI、ESLint、Prettier、Knip 和后端测试入口。测试必须运行本次源码对应的产物，不能误测旧文件。
- 涉及 `import.meta.url`、`import.meta.dirname` 的目录推导需专项检查。构建产物移动后，数据目录、静态 `dist/`、测试夹具的位置必须仍正确；集中注入解析后的路径。
- 新增产物目录加入 Git、lint、测试与 dead-code 的适当排除，源代码目录仍完整纳入检查。

## 5. 目标架构与依赖方向

保留一个浏览器应用、一个 Node 服务和一份用户数据目录。业务模块是代码边界，不是独立部署服务。

```text
前端 app / pages                         后端 index（进程）
        |                                        |
        v                                        v
features（业务 UI、模型、用例）          app（依赖与 HTTP 装配）
        |                                 |                |
        +--> components（跨业务 UI）       v                v
        +--> store（唯一状态源）         routes         调度器
        +--> lib（有明确名称的能力）        \              /
                    |                      v            v
                    v                 modules 的应用服务
                 shared                 |            |
                                   纯领域规则    文件/平台/模型适配

前后端通过已有 HTTP/文件契约连接；不互相导入运行时实现。
```

具体规则：

1. 页面负责路由参数与跨业务编排，不包含内容解析、合并算法或长段副作用。
2. feature 不直接导入另一个 feature；跨业务流程由 page/app 编排，共用能力进入按职责命名的 lib/components。
3. model 只处理输入到输出，不访问 React、store、DOM、网络或文件系统。
4. store 不导入 feature/UI；状态同步适配不能反向导入 store。需要调用 store 的同步编排放在 `store/sync/` 或 app。
5. shared 不依赖业务类型、store、feature、page 或 components；lib 不依赖上层 UI 或 store。现有不满足者逐个迁走，再开启强制门禁。
6. 跨业务 components 不依赖 feature；现有阅读器宿主等兼容入口在明确清单中暂留，最后随消费者迁移而收缩。
7. 后端 route 只做 HTTP 映射与校验，应用服务不接收 Hono Context，不依赖 routes。
8. 后端模块只能使用其他模块的公开应用接口或注入的能力，不深层访问其文件实现；跨模块组合在 app 或明确的工作流中完成，不建立相互引用。

不创建总的 `services/` 或 `utils/` 来接收所有搬走的代码。新目录必须能回答“谁负责、谁可以依赖、如何测试”。

## 6. 前端按业务组织的方案

### 6.1 总体目录

```text
src/
  app/                          启动、鉴权恢复、路由、PWA、应用外壳
  pages/                        路由入口和跨业务流程，继续 lazy loading
  features/
    library/                    导入、书架、书单、回收站
    reader/                     EPUB 工作区、选区、标注、阅读轨迹、资源库
    rss/                        订阅源、内容列表、文章、日报、时间线
    video/                      视频资料、播放、字幕、时间点笔记
    settings/                   模型、来源、授权、账号与系统设置
  components/
    ai/                         共用聊天展示、模型选择、引用标签
    reading/                    Reader/RSS 共用样式面板与选区展示
    notes/                      通用 Markdown 编辑器
    layout/                     ActivityRail 等跨业务布局控件
    FoliateEpubReader.tsx        迁移期间保留的兼容宿主
  lib/
    api/                        HTTP 请求、认证 API 与统一错误
    persistence/                分区传输、写队列、旧浏览器迁移适配
    epub/                       文件 API、元数据/封面、索引基础能力
    reading/                    跨 Reader/RSS/store 的样式规则与字体适配
    ai/                         任务 API、订阅协议、模型与推理公共规则
    video/                      跨 RSS/视频的导入 API 与地址能力
  shared/
    ui/                         AppFormModal、ExpandableImage 等
    browser/                    media query、纯浏览器能力
    utils/                      少量无业务含义的函数，避免泛化大文件
  store/
    useLearningStore.ts         唯一组合入口
    actions/                    领域写操作
    selectors/                  有实际复用需求的领域派生查询
    persistence/                默认合并、迁移与保护规则
    sync/                       依赖 store 的同步编排
  types/                        拆开的共享领域类型
  types.ts                      迁移期稳定的类型重导出入口
  styles/                       原编号、选择器和导入顺序保持
```

这里没有强制新增 `features/ai`。AI 同时服务 Reader、RSS 和 Video，现有规则禁止 feature 相互依赖；公共任务协议与展示归入有名称的共享业务能力，各业务自己的上下文、工具入口和交互策略仍留在所属 feature。以后出现独立 AI 页面时再单独设计，而不是为目录整齐制造跨 feature 依赖。

### 6.2 每个 feature 的约定

```text
features/rss/
  index.ts                      少量公共入口，不导出所有内部文件
  model/                        纯类型、排序筛选、内容规则
  application/                  API 调用、store 协调、业务用例 hooks
  hooks/                        DOM/生命周期相关 hooks，按需存在
  ui/
    sources/                    来源树、管理抽屉、来源菜单
    items/                      列表、列表筛选与操作
    article/                    正文、目录、详情工具栏、图片查看器
    digest/                     日报与设置
    panels/                     AI、评论、时间线
    workspace/                  桌面/移动布局壳
```

- `application/useRssSourceOperations.ts` 一类 hook 负责“完成什么业务操作”；`hooks/useArticleHeadingObserver.ts` 一类 hook 负责“如何跟踪 DOM 生命周期”。避免两处出现同名 controller 或同一任务的两套状态。
- 组件按用户可识别的区域拆分，较小且只被一个父组件使用的子组件可以同文件保留。
- 不为每个 feature 强制生成全部目录；Library 没有独立基础设施时就不创建空的 `infrastructure`。
- UI 默认接收 props；确有订阅需求的容器组件可用 store selector。业务副作用进入 application，不要求所有组件都经一个巨大的 Context。
- 公共入口只暴露页面所需的能力，内部使用相对路径；不创建汇总所有 feature 的全局 barrel，防止破坏路由分包。
- 单元测试与对应 model/hook 邻近，沿用 `src/**/*.test.{ts,tsx}`。

其他模块按同一规则划分：Library 的 UI 分 `shelf/book-lists/trash/import`；Reader 分 `workspace/navigation/annotations/right-panel`，保留 `foliate/` 专门边界；Video 分 `library/player/transcript/notes/panels`；Settings 按现有设置区块组织，不将所有表单硬拆成多层。

### 6.3 代表性旧路径到新职责的映射

| 当前文件/能力 | 目标归属 | 迁移说明 |
| --- | --- | --- |
| `components/ImportBooksButton.tsx` | `features/library/ui/import/` + application 导入用例 | 上传 UI 与导入流程分开；EPUB 适配仍留 lib |
| `components/RssMobileWorkspace.tsx` | `features/rss/ui/workspace/` | 保留桌面/移动共享的业务数据和组件 |
| `components/RssDigestSettingsSheet.tsx` | `features/rss/ui/digest/` | 日报配置属于 RSS |
| `RssPresentation`、`RssToolbars`、`RssDialogs` | RSS UI 各业务子目录 | 按组件职责拆，不仅改成多个 numbered 文件 |
| `components/RssAiPanel.tsx` | 公共聊天展示 + RSS/Video 各自应用编排 | 先提炼已证实共用的任务能力，再留下各业务面板 |
| `components/ReaderWorkspace`、`ReaderMobileChrome` | `features/reader/ui/workspace/` | 保持相同 React 挂载位置与正文实例数量 |
| `components/ReaderToolbar.tsx` | reader 导航工具栏 + `components/reading/` 样式面板 | 不能把 RSS 需要的样式面板一起移到 reader 私有目录 |
| `ReaderSelectionOverlays` | `components/reading/` 中的共用展示 | EPUB CFI 与 RSS 文本锚点算法分别保留在领域模块 |
| `MarkdownNoteEditor`、`AiConversationPrimitives` | `components/notes/`、`components/ai/` | 跨业务、但带领域语义，不放无业务 shared |
| `lib/rssContent.ts`、`lib/rssVideo.ts` | RSS model 与浏览器适配，按函数拆 | 纯搜索匹配与 DOM 清洗分开，model 不依赖 DOM |
| `lib/readerThemes.ts`、`readerFonts.ts` | `lib/reading/` | 共享规则不能依赖 reader feature；纯主题计算与字体加载分开 |
| `lib/epubStorage.ts` | `lib/epub/` 文件 API + `lib/persistence/legacy/` | 拆开日常存储和一次性浏览器迁移 |
| `lib/learningStateSync.ts` | `store/sync/` | 它依赖 store，不能作为底层共享适配器 |
| `lib/format.ts`、`uuid.ts` | 通用部分进入 `shared/utils/` | 含业务含义的格式化规则留所属领域 |
| `AppSidebar`、`StateDomainGate` | `app/` 对应组合模块 | 属于应用外壳与启动状态，不是任意业务组件 |

`src/types.ts` 可拆成 `types/book.ts`、`types/reading.ts`、`types/rss.ts`、`types/video.ts`、`types/ai.ts`；只供单个 feature 内部使用的类型放它自己的 model。持久化 `LearningState` 仍由 store 管理，避免共享类型目录再次成为所有内部类型的集合。

### 6.4 大页面怎么变薄

以 RSS 为例，页面最终主要读取 URL、连接领域用例、组合工作区，以及处理“从 RSS 导入视频并跳转”这种跨业务流程。过滤、正文派生、原文/译文状态、标注和弹层生命周期分别由其所属模块承担。

不把 997 行页面整体搬到 `useRssPageController.ts` 后宣布完成。拆分后的模块必须有独立输入、输出、清理责任；共享同一生命周期的状态可以继续一起管理。

Reader 则先提取选区/评论编辑流程与导航意图，保持 Foliate 生命周期按 `book.id` 建立、最新参数经稳定 ref 输入。移动与桌面共用一个正文实例，不能因为移动组件位置而重新挂载阅读器。

## 7. 后端如何用 Hono 模块化

### 7.1 推荐结构

```text
server/
  index.ts                      进程启动、停止、信号与调度器生命周期
  app.ts                        唯一 HTTP 组合入口
  app/
    dependencies.ts             构造共享状态仓库、任务管理器与模块服务
    middleware.ts               认证、通用响应头
    http.ts                     请求体限制、HTTP 错误映射
  routes/
    books.ts                    Hono 书籍子应用
    state.ts                    状态同步子应用
    rss.ts                      订阅、文章、日报相关 HTTP 入口
    videos.ts
    ai.ts                       任务与 SSE
    auth.ts / aiOAuth.ts
    openApi.ts / mcp.ts
    settings.ts / health.ts / static.ts
  modules/
    library/                    入库、书单、回收站、书籍关联文件生命周期
    reading/                    阅读数据规则、索引与笔记能力
    rss/                        来源、文章、翻译、日报及刷新调度
    video/                      元数据、字幕与视频规则
    ai/                         任务状态机、Agent 运行时、消息转换
    knowledgeMaps/              知识地图、信息图与图片资源用例
    auth/                       单用户会话与账号
    credentials/                OAuth、来源凭据、OpenAPI Token，分文件隔离
    state/                      分区契约、跨领域保护顺序、统一状态仓库
  infrastructure/
    fs/                         原子写入、私有权限、受限路径、流式文件写入
    http/                       对外请求、超时、SSRF 与重定向检查
  config/                       环境变量校验和路径解析
```

业务实现按 `modules/<业务>` 聚合，HTTP 入口继续集中在 `routes`，以延续现有“只有应用组合入口导入 routes”的边界。它们不是两套业务实现：route 是协议入口，module 是唯一用例实现。前后端无需机械地一一对应目录，例如服务端不需要为设置页面创建一个承载所有业务的 settings 大模块。

模块内部按需要使用 `model/`、`application/`、`infrastructure/`、`jobs/`、`tools/`，并通过 `index.ts` 暴露少量应用接口：

```text
modules/rss/
  index.ts
  model/                        来源类型、合并与已读规则
  application/                  订阅刷新、文章提取、日报和翻译用例
  infrastructure/               RSS、B站、YouTube Feed 适配器
  jobs/                         刷新与日报调度器
```

小模块可以只有两三个文件，不要求每个请求都经过 controller/service/repository 三个空壳。文件存储接口只在有替换、测试隔离或跨模块调用需求时建立。

### 7.2 Hono 路由的写法

采用“返回子应用的工厂函数 + 注入具体依赖 + `app.route()` 挂载”。Hono 官方推荐用子应用组织较大的服务，并优先在路由定义处写简短 handler，保留参数类型推断；不必模仿传统 MVC 创建一层 controller。[Hono 最佳实践](https://hono.dev/docs/guides/best-practices)

以下仅示意现有资源列表接口的组织方式，不是可直接替换全文件的补丁：

```ts
// server/routes/books.ts
import { Hono } from 'hono';
import type { LibraryService } from '../modules/library/index.js';

export function createBookRoutes(library: LibraryService) {
  return new Hono().get('/:bookId/resources', async (c) => {
    const resources = await library.listResources(c.req.param('bookId'));
    return c.json({ resources });
  });
}

// server/app.ts 内，保持原认证 middleware 已先注册
app.route('/api/books', createBookRoutes(deps.library));
```

`LibraryService` 表示重构后对外的用例接口，不是当前已有类型。它不接收 `Context`，也不调用 `c.json()`。输入校验、响应码和错误映射由 HTTP 层负责；业务规则即使从 MCP 或调度器调用，也要成立。

Hono 分组遵循注册与挂载顺序，子应用应定义完路由后再挂载。迁移时逐项核对路径前缀、尾斜杠、通配符、HEAD 与方法兜底，不能只验证 GET 成功。[Hono 路由文档](https://hono.dev/docs/api/routing)

暂不强制把现有客户端替换为 Hono RPC。类型化子路由先改善服务端；之后只有在类型推断、构建边界和收益明确时再评估客户端接入，避免浏览器类型依赖拉入整棵 Node 实现。

### 7.3 大服务的拆分方向

| 当前实现 | 拆分方向 | 必须保持的行为 |
| --- | --- | --- |
| `aiJobs.mjs` | 通用任务状态机/订阅器；reading chat、RSS summary/translation/digest、video chat 各自的任务处理器 | 取消、终态、重连、消息写回、去重、错误脱敏 |
| `aiChat.mjs` | provider runtime、消息转换、流事件转换、Agent 执行器；工具与业务 Prompt 归所属模块 | 真实思考与工具过程、明确调用上限、schema 校验 |
| `storage.mjs` | 通用 FS 原语；state 仓库；封面/笔记文件适配；各业务快照保护 | 私有权限、原子写、统一队列与冲突保护 |
| `rssScheduler.mjs` | RSS 合并纯函数、刷新用例、定时器生命周期 | 错峰、最短间隔、重叠刷新合并、完整正文保留 |
| `stateRoutes.mjs` | HTTP handler + state 同步应用服务 | 保护规则的既有执行顺序、分区 ETag、旧快照兼容 |
| `openapi/importBook`、`mcp/library` | HTTP/MCP 适配调用 library 用例 | 同一入库/回收站逻辑；Token 授权范围和上传限制 |

模块依赖通过函数参数传递，不引入全局 DI 容器。AI 的书籍、RSS、视频工具由所属模块提供能力，应用装配后注入 Agent；AI 核心不反向深层导入各业务的存储文件。

SSRF 校验虽然当前部分位于 `rss.mjs`，其实是外部 HTTP 请求的共同安全能力。迁移时保留 DNS、重定向、超时、响应大小等已有约束；平台私有协议和认证仍归对应适配器，避免创建一个无差别携带凭据的“通用 fetch”。

### 7.4 统一写入边界不能拆散

保留单个服务进程内唯一的状态写队列。模块即使各自有仓库接口，也都必须使用同一个 state repository 实例，不得各自读取/覆盖 `state.json`。

书籍彻底删除涉及书架、阅读记录、会话、笔记、索引、封面和生成图片。由 library 删除用例在同一状态协调边界内调用各模块清理能力；慢速网络请求不能占着写队列，完成写回前重新检查书籍有效性。多文件操作不宣称具有数据库事务能力，保留既有失败清理与竞态保护，并补相应测试。

## 8. API、类型与持久化契约如何保持

### 8.1 冻结外部契约

先从所有 routes 生成或人工核对接口清单：方法、路径、请求限制、鉴权、状态码、响应体、响应头、流事件和错误行为。不要只保留一个 `/api/books` 等前缀列表。

特别保留：

- 前端 `/`、`/books/:bookId`、`/rss`、`/videos`、`/settings`，RSS 查询参数恢复及未知路由回退。
- lazy loading 与各路由的 `StateDomainGate`；登录仍沿用当前应用鉴权流程。
- Cookie、同源检查、OpenAPI/MCP Bearer 与供应商授权的相互隔离。
- 原有 `204/304/405`、错误 JSON、缓存/ETag、文件读取、SSE `job` 事件及 revision 语义。
- 自定义读取请求体的大小限制与上传流式处理；不能换成默认 JSON 解析后丢掉限制。
- PWA 资源更新和旧客户端访问同一服务端的兼容性。

### 8.2 保持六个状态分区

| 分区 | 当前职责 |
| --- | --- |
| `library` | 书籍、书单、回收站、书籍删除墓碑 |
| `reading` | 高亮、标注删除墓碑、笔记、阅读记录 |
| `conversations` | 消息、会话与其中的已读字段 |
| `rss` | 文件夹、订阅源、条目、标注、日报、执行记录/设置、面板宽度 |
| `videos` | 视频资料、时间点笔记、面板宽度 |
| `preferences` | 模型、搜索、AI 偏好、应用主题与阅读样式/布局 |

保留 `learning-center-state-v1` 和当前版本 `33`。纯目录/类型重构不触发版本增长；任何真实数据结构变化必须作为独立迁移处理，并检查默认值、actions、两端字段映射、迁移、合并和兼容测试。

前后端目前各维护一份 `STATE_DOMAIN_FIELDS`。第一步增加字段覆盖与双方一致性测试；后端 TS 稳定后，可建立仓库根部 `contracts/`，只共享经验证相同的 DTO、状态分区常量与运行时 schema，不共享 React、store 或 Node 实现。每个持久化字段只能归属一个分区，公共 DTO、磁盘格式和私密凭据类型分别命名，不能把完整内部状态类型直接当 HTTP 输出。

引入 `contracts/` 是目标架构的一个明确新增边界，届时必须同步编译输出、浏览器引用、边界检查和 Docker 复制规则。客户端与服务端的合并策略不因“看起来相似”就强行统一；服务端权威保护与客户端乐观合并可能有不同职责。

## 9. 如何证明功能与 UI 一致

不能仅凭“构建成功”承诺完全一致。验收需要冻结基线、自动比较与人工检查共同完成。

### 9.1 重构开始前建立基线

1. 在固定提交上运行 `npm run verify` 和 `npm run verify:full`，记录环境、测试结果、已有失败与当前限制。现有缺陷不自动算作本轮需要修复的行为变更。
2. 使用不含个人数据的 EPUB、RSS、视频字幕和 AI 事件夹具。真实模型/OAuth/平台请求以适配器 stub 验证确定性流程，少量人工联调另列，避免付费请求进入每次回归。
3. 保存关键页面与交互状态截图、API 契约及持久化样例。截图基线应在改变布局代码前审阅确定，不能用重构后截图直接覆盖原图。
4. 固定浏览器、字体、时区、时间与测试数据；等待字体和正文完成布局。只遮罩确实不稳定且不影响验收的信息，不能遮住正文、工具栏或关键状态。

### 9.2 验收矩阵

| 范围 | 必须覆盖的代表行为 |
| --- | --- |
| 页面与外壳 | 五个路由及失效回退、直接访问/刷新、状态分区加载、登录恢复、主题切换 |
| 书架 | 导入与封面、筛选、书单排序、回收站恢复/彻底删除、关联文件清理 |
| Reader | CFI 精确恢复、章节边界、连续翻页与目录队列、拖动分栏、字体与样式同步 |
| 标注与评论 | 扩展高亮视觉/命中范围、评论角标、删除规则、快捷键保存、选区消失收起 |
| 移动交互 | 单正文实例、沉浸显示、选区拖动、最上层弹层优先返回、虚拟键盘、安全区 |
| RSS | OPML、来源排序、URL 恢复、已读/收藏、原文/译文与结构、日报、视频跳转 |
| Video | 导入去重、字幕模式、时间点跳转、播放进度和笔记、移动布局 |
| AI | 发送立即收起、SSE 断开/重连、轮询收敛、取消、未读状态、真实工具过程 |
| 图片与外部接入 | 地图/信息图结果、资源收藏与重命名、删除竞态、Token/MCP 授权隔离 |
| 数据 | 旧版本迁移、多标签页/旧快照、删除不复活、字段不丢失、并发任务写入 |
| 运行服务 | 静态资源、生产构建、健康检查、重启、调度器启动一次与正常停止 |

视觉至少覆盖 `375/768/1024/1440px × 浅色/深色`，并包含空状态、长文本、loading/error/disabled、面板展开与折叠、表单弹窗和图片预览。检查键盘焦点、触控命中区、无横向溢出与 reduced motion。Chrome 移动模拟不足以证明真实虚拟键盘、安全区和系统返回行为，相关项目保留真机人工验收记录。

### 9.3 自动化补强

- 保留既有测试，按本次迁移风险补行为测试，不为简单搬文件编写只镜像实现的测试。
- 新增 Playwright 截图差异断言；出现差异先定位原因，不随意放大阈值或自动更新基线。
- RSS 与视频目前没有独立命名的 E2E spec，不能由“顶层路由能打开”推导完整业务已覆盖；优先核对并补齐上述矩阵中的业务路径。
- 增加 CI 浏览器作业：先工程验证与构建，再安装匹配的 Chromium 运行 E2E；沿用可配置浏览器通道，保存失败截图、trace 和差异图。
- 每批代码至少 `npm run verify`、`git diff --check`；涉及路由、交互、响应式、样式、PWA 或 Foliate 时执行 `npm run verify:full`。缺运行条件必须明确记录，不能标成通过。
- 性能以基线比较：路由分包、初始资源量、打开书籍与分页响应、列表滚动和任务订阅数量。先测量再设阈值，不凭空许诺重构提升多少百分比。

## 10. 分阶段实施和验收点

| 阶段 | 主要改动 | 完成条件 |
| --- | --- | --- |
| 0. 冻结基线 | 功能/接口/数据清单、测试与视觉基线、依赖图 | 能复现现状，关键缺口已补齐，明确非本轮修复项 |
| 1. 完善工程边界 | TS 后端构建桥接、检查覆盖、CI E2E、路径与产物规则 | 开发/生产/容器/E2E 均启动正确，旧测试仍运行 |
| 2. 前端低风险归位 | Library、Settings；通用组件、lib 和类型职责整理 | 公共入口明确、无新增跨 feature 依赖、UI 对比通过 |
| 3. 后端基础和路由 | Hono 子应用、显式依赖、存储原语与 state 应用服务 | 接口契约和持久化保护完整保留，只有一个写队列 |
| 4. RSS 与视频 | 页面用例、正文/来源/日报/UI、共享 AI 能力与平台适配 | 两端完整业务路径、移动返回和状态恢复通过 |
| 5. AI 任务和图片 | 状态机、供应商、消息、领域工具、生成结果写回 | 断连继续、取消、重连、上限、去重和删除竞态通过 |
| 6. Reader 高风险边界 | 页面编排、宿主、手势/选区、Foliate 构建变换 | CFI/高亮/连续导航/移动选区/Chromium 兼容专项通过 |
| 7. 收尾和验收环境 | 删除迁移别名、统一规则、文档、完整回归、独立预览 | 无双实现、无遗留绕过，用户可对照验收 |

每个阶段继续拆成小批次，默认一个批次围绕一条可验证的业务链路。移动文件、改类型、改算法和改样式尽量不混在同一个变更中。出现一致性偏差就暂停该批次并定位，不能靠继续迁移掩盖问题。

**Foliate 最后处理。** 先保持 `src/features/reader/foliate/**`、`FoliateEpubReader`、`lib/foliateReader.ts` 与 `vite.config.ts` 的现有边界。确有必要时，将构建变换提取到 `build-tools/foliate/`，原 Vite 配置只负责调用；提取不修改变换文本或执行顺序，且必须有锚点检查与浏览器回归。不能为了缩短文件而直接替换兼容实现。

**CSS 暂不搬进 feature。** 继续保留 `src/styles.css` 的有序导入、编号规则和现有选择器。重构优先保持 DOM 结构、组件 key、portal 位置与状态归属；如果调整 CSS 文件或级联，单独作为需要视觉验收的批次处理。

## 11. 如何防止重构后再次变乱

为每个新需求回答三个问题：属于哪个业务模块、复用哪一个已有能力、需要改变哪个公开契约。以此选择落点，不以“这里已有一个很大的工具文件”为理由继续追加。

- 用可解析 TS/JS 的导入检查覆盖 static import、export-from、动态 import 和实际配置的别名；可优先复用现有 TypeScript 编译器 API，不为此立即引入大型架构框架。
- 加入 feature、model、store、shared、lib、后端 routes/modules/infrastructure 和可选 contracts 的依赖规则及循环检测，识别通过重导出的间接绕行。
- 后端通用 infrastructure 不导入业务；modules 的基础设施适配可依赖自身模型，跨模块只能走公开接口。允许的依赖方向形成明确清单。
- 兼容入口每个都记录消费者、移除条件和对应阶段；不能长期保留旧实现与新实现同时运行。
- 新增/重构目录进入格式与 lint 检查，不提高 warning 上限，不扩大 Foliate Hooks 例外，不用宽泛 Knip ignore 隐藏死代码。
- 文件超过约 300–400 行时触发职责审阅，但不是强制行数上限。边界清楚的兼容适配器可较长，几十行却相互循环的文件同样需要调整。

## 12. 与现有规范、发布和回退的关系

现有 [AGENTS.md](../../AGENTS.md) 与 [架构文档](../architecture.md) 在确认前继续有效。本方案涉及的明确规范变更是：后端入口从 `.mjs` 到 `.ts`、新增 `server/modules`/基础设施职责、可能新增 `contracts/`、调整后端测试发现与构建方式，以及最后阶段的 Foliate 构建工具位置。实施对应阶段时必须同步更新规范、架构文档和检查脚本，不能先违反边界再补说明。

本轮只写文档，不合并、不 push、不部署，也不改用户数据。方案确认不等于当前文档已证明生产可替换。

实际全面重构先作为待验收变更部署到独立服务，使用示例数据，目标访问域名沿用 `learning-center.orca.island-x.autos`；数据目录、卷、凭据和配置与生产隔离，不复制个人 EPUB、笔记、阅读记录或 API Key。当前工作流主要围绕 main 生产发布，需要单独落实预览服务发布入口，不能把 main push 当作预览操作。

预览交付应包含构建提交/镜像标识、工作流链接、目标地址、健康检查结果、域名配置说明及只针对该服务的停止/清理方法。Vercel 域名设置由用户处理。用户验收后再安排生产切换；切换前备份用户数据并验证恢复方式，保留上一镜像与版本清单，不通过强推或历史重写回退。

本轮目标不改变数据格式，因此通常可以回退应用版本；但回退应用不能覆盖用户在验收期间产生的新数据。若后续批准了格式迁移，必须另行设计数据兼容与恢复步骤。

## 13. 确认范围与最终交付标准

建议将本方案整体作为以下四项决策的确认依据：

1. **技术方向**：保留核心栈与文件存储，后端逐步 TypeScript 化，不同时进行框架升级。
2. **模块结构**：前端五个业务 feature + 明确共享能力；后端 Hono routes + 业务 modules + 通用基础设施。
3. **迁移方式**：先建立基线，逐批迁移，Reader/Foliate 最后处理，CSS 和外部契约保持稳定。
4. **验收方式**：工程测试、接口/数据兼容、视觉矩阵和独立示例数据预览共同验收。

最终交付不以“目录变整齐”结束，而应包含：

- 可按业务找到功能实现的目录、公开接口与依赖规则。
- 后端类型检查及所有源目录的质量门禁，没有新的类型逃逸或重复状态源。
- 原有功能/UI/数据契约的验证证据与明确的残余限制。
- 更新后的 README、架构文档、协作规范及旧路径迁移说明。
- 可访问的独立验收服务、可追踪的构建版本及清理/回退步骤。

确认后先执行阶段 0。若基线测试发现与本文静态判断不同的行为，再根据证据调整实施顺序，并记录原因。
