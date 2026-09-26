# 第二轮结构复盘与重构建议

日期：2026-09-26。审查基线：`f60f3522b32a95b6ba0235c266dee80959303478`。状态：**用户已授权整仓实施**。本文保留调研时的分析与建议；后续确认新增“一 TSX 一组件、API 与类型按业务同目录”的规则，并将 RSS 样板推进改为整仓执行。最终目录与约定见 [当前架构](../architecture.md)。

建议保留现有技术栈和你提出的页面组织方式，把下一轮重点放在三个结果上：**组件拥有自己的交互状态；页面只协调区域之间的关系；修改一个功能时，大部分工作能在它所属的目录完成。**

前两轮完成了类型化、API 收口和文件迁移，但我对职责划分做得还不够。尤其是上次按“Hook 被哪些文件引用”判断归属，漏掉了一个大 Hook 内部混合着多个组件私有状态的问题。测试通过证明了当时覆盖的行为保持一致，不能证明结构已经足够清晰。

## 1. 当前目录为什么仍然难维护

当前 `src` 有 247 个文件，其中 `pages` 144 个、`util` 49 个。数量本身不是整改指标；下面这些具体问题更影响维护。

| 问题                                     | 当前证据                                                                                                                                                                                                                                                                                                                                       | 修改时的影响                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 大页面变成了“大入口 + 大 Hook”           | [RSS index](https://github.com/IsLand-x/simple-learning-center/blob/f60f3522b32a95b6ba0235c266dee80959303478/src/pages/rss/reader/index.tsx) 616 行；[useRssPageStore](https://github.com/IsLand-x/simple-learning-center/blob/f60f3522b32a95b6ba0235c266dee80959303478/src/pages/rss/reader/store/useRssPageStore.ts) 560 行，返回 150 个字段 | 改一块区域仍要理解整页的接线；入口还有正文滚动、选区清理、标题显隐逻辑 |
| 表单私有状态被提升到页面                 | [useRssSourceOperations](https://github.com/IsLand-x/simple-learning-center/blob/f60f3522b32a95b6ba0235c266dee80959303478/src/pages/rss/reader/store/useRssSourceOperations.ts) 第 54 行起，同时保存添加订阅的草稿、新建文件夹名称、提交状态和刷新状态                                                                                         | 改一个输入框要经过 Dialog → index → PageStore → SourceOperations       |
| 文件拆开后仍互相依赖内部细节             | [readerAnnotationActions](https://github.com/IsLand-x/simple-learning-center/blob/f60f3522b32a95b6ba0235c266dee80959303478/src/pages/books/detail/store/readerAnnotationActions.ts) 接收大量状态和 React setter；Reader 页面 Hook 仍返回 56 个字段                                                                                             | 调用方知道太多内部实现，新增一个标注状态要改多处接线                   |
| `store` 和 `util` 的名字不能准确说明内容 | `store/rssOpml.ts` 做文件导出，`settings/store/mcpConfig.ts` 生成配置文字，`store/model/readerSurfaceTypes.ts` 是组件契约；真正的持久化 store 却在 `util/state`                                                                                                                                                                                | 找一个函数时，需要猜它究竟被归进了哪种“层”                             |
| 单页基础能力仍放在全局工具区             | `util/epub/bookCovers.ts` 只服务书架封面；`util/epub/foliateReader.ts` 的消费者都属于阅读器                                                                                                                                                                                                                                                    | 阅读器维护要在页面目录和全局工具目录之间来回寻找                       |
| 最复杂的职责尚未拆清                     | `bindFoliateDocumentInteractions.ts` 1,089 行，同时处理手势、长按、选区手柄、跨页选择、点击命中和清理                                                                                                                                                                                                                                          | 目录层级变多，修改风险仍集中在同一个文件                               |
| 样式仍需两处排查                         | 现有全局 CSS 共 5,610 行；部分 JSX 同时有语义类、长串任意值 Tailwind 和后置 CSS 覆盖                                                                                                                                                                                                                                                           | 看完组件仍不确定实际样式由哪里决定                                     |
| 后端同一业务被横向切开                   | 书籍操作跨 `routes/bookRoutes`、`modules/library`、`reading`、`knowledgeMaps`、`state`；23 个测试都在 `server` 根目录                                                                                                                                                                                                                          | 路由、业务实现、测试没有围绕同一个功能聚合                             |

已经合理的部分继续保留：根 `components` 的 10 个 UI 文件确有跨页面消费者；根 `api` 的业务 class 与 `types` 的请求/响应类型方向正确；唯一持久化 store 和状态文件的串行写入也有必要。

## 2. 实际参考了哪些项目

以下观察来自仓库文件和官方文档，采用固定提交链接，避免以后目录变化导致说明失真。这些项目都有自己的历史和规模，不能把某个项目的整棵目录树当成通用标准。

| 参考                                            | 实际组织方式                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 本项目采用的部分                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Folo，RSS 阅读应用**，`fac0b083`              | `modules/entry-content` 聚合正文入口、局部组件、操作和 Hook。正文入口自己保留轻量状态；滚动与导航交互由本模块内的组件承担。[正文入口](https://github.com/RSSNext/Folo/blob/fac0b0832a2f69de0aef3c19a3e54e22673e37de/apps/desktop/layer/renderer/src/modules/entry-content/EntryContent.tsx)、[滚动与导航组件](https://github.com/RSSNext/Folo/blob/fac0b0832a2f69de0aef3c19a3e54e22673e37de/apps/desktop/layer/renderer/src/modules/entry-content/components/entry-content/EntryScrollingAndNavigationHandler.tsx)               | 借鉴正文区域的职责聚合和组件自有状态。其多端 monorepo、全局事件系统和更多层级不适合直接搬进来                                      |
| **Bulletproof React，架构参考项目**，`9506629e` | 按功能聚合代码；目录按需创建；明确允许共用 API 放在根 `api`；建议直接导入文件，约束功能之间的依赖。[结构说明](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/project-structure.md)                                                                                                                                                                                                                                                                                             | 用我们的 `pages/<业务>/<子页面>` 承担功能归属，保留根 API，不再额外铺一套 `features`。这是参考项目，不能当作大型生产应用的验证结论 |
| **OpenStatus，使用 Hono 的应用**，`d37322c7`    | monitor 的路由、schema 和测试在同一业务目录；可复用业务操作另外按实体聚合。[路由入口](https://github.com/openstatusHQ/openstatus/blob/d37322c7b16d60ba5ba5153b06637727b8a2c204/apps/server/src/routes/v1/monitors/index.ts)、[同目录测试](https://github.com/openstatusHQ/openstatus/blob/d37322c7b16d60ba5ba5153b06637727b8a2c204/apps/server/src/routes/v1/monitors/get.test.ts)、[业务操作](https://github.com/openstatusHQ/openstatus/blob/d37322c7b16d60ba5ba5153b06637727b8a2c204/packages/services/src/monitor/create.ts) | 借鉴业务分组和测试就近。它有数据库、多个 package，且 v1 在迁移；没有完整采用下文拟议结构，也不构成本项目引入数据库仓储层的理由     |

Hono 官方建议用 `app.route()` 组合子应用，让 handler 尽量紧邻路径定义以保留类型推导；需要抽离时可用 `factory.createHandlers()`。官方没有要求每个模块都建立 controller、service、repository、types 全套层次。[Hono Best Practices](https://hono.dev/docs/guides/best-practices)

**我的取舍：沿用你指定的目录词汇，在目录内部落实业务归属和状态生命周期。** 根 API 使用 class 是本项目已确定的约定，并非这些参考项目共同规定的写法。

## 3. 建议的前端顶层

```text
src/
  main.tsx
  layout/       程序壳、登录、导航、路由、启动与鉴权恢复
  pages/        按业务与子页面组织的完整页面
  components/   确有跨页面复用的组件
  api/          按业务划分的 API class、实例、HTTP/SSE 传输
  types/        前端请求体、响应体及跨页面的客户端类型
  store/        唯一持久化 store、领域 actions、迁移与同步
  util/         确有跨页面消费者的工具与适配能力
  styles/       Tailwind 入口、全局基准、必要兼容样式
```

唯一建议增加的顶层职责是 **`store/`**，把现有 `util/state/` 原有实现迁过去。这样全局状态有明确落点，避免因为它被多个页面调用就称为工具。继续保留单一 Zustand persist，不增加第二份书籍、RSS 或对话缓存。

保留 `books/list`、`books/detail`、`rss/reader`、`videos/study`、`settings`。暂不改这些页面名称和 URL，也不引入额外的 `app/features/shared/lib/services` 前端分层。

## 4. 页面内部先按“区域”收口

先用 RSS 做样板，示意如下。文件按需存在，不要求每个组件都有同样的配套文件。

```text
pages/rss/reader/
  index.tsx                         组合区域，选择桌面/移动布局
  store/
    useWorkspaceState.tsx           URL 导航适配与少量页面临时状态
    selectors.ts                    这些状态的派生计算，确有需要才建立
  components/
    SourcesPanel/
      index.tsx                     订阅源区域的真实组件实现
      SourceTree.tsx
      AddSourceDialog.tsx           自己管理输入草稿与提交反馈
      useAddSource.ts               表单逻辑复杂时才抽离
      CreateFolderDialog.tsx
      useRefreshSources.ts
      SourcesScope.tsx              需跨布局保留的来源操作生命周期
      opml.ts
    ItemsPanel/
      index.tsx
      ItemRow.tsx
      ItemContextMenu.tsx
    ArticlePanel/
      index.tsx
      ArticleToolbar.tsx
      ArticleBody.tsx
      useArticleSelection.ts
    DigestPanel/
      index.tsx
      DigestSettingsDialog.tsx
    AssistantPanel/
      index.tsx                     组合共享聊天与本页评论、时间线
    RssTaskCoordinator.tsx           确需页面生命周期的任务恢复与同步
    MobileWorkspace.tsx
```

区域组件可以直接选择全局 store 中需要的数据，并调用本业务 API。`index.tsx` 不再把所有数据、setter 和事件逐个转发一遍。区域之间共享的导航和筛选由页面状态接口协调，实体数据继续来自根 store。

RSS 已在 URL 中保存 `source/feed/item/digest/range/view/panel`。这些字段继续由 URL 驱动，`useWorkspaceState` 只封装解析、默认项选择与导航操作，不能另存一份 `useState` 后双向同步。当前浏览器返回、刷新直达、移动面板临时历史，以及 push/replace 的使用语义都要保留。搜索草稿、桌面面板等未进入 URL 的临时状态才使用 React 状态。

这里的 `useWorkspaceState` 可以用 React 状态与页面范围的 Context；不因存在 `store/` 目录就必须再创建 Zustand 实例。仅有少量状态的小页面直接用 `useState`，不建立空目录。Context 也只承载真正共享的选择与布局状态；不能把原来的 150 字段对象原样藏进 Provider。

复杂区域使用一个文件夹收纳私有文件，简单组件保留单文件。不要继续嵌套 `store/hooks/model`，也不要给每个按钮创建 `components/hooks/types/utils` 全套目录。组件文件夹的 `index.tsx` 是实现入口，不能只转发根组件。

### 状态归属要检查到字段和生命周期

| 状态或能力                                   | 应放在哪里                                                 |
| -------------------------------------------- | ---------------------------------------------------------- |
| 添加订阅的 URL、名称、校验、提交 loading     | `AddSourceDialog` 内，复杂部分放同级 `useAddSource`        |
| 当前来源、当前文章、多个区域共用的筛选       | 页面 `store` 封装 URL 派生值与导航操作；仅保留必要临时状态 |
| 书籍、RSS 条目、阅读进度、对话等持久数据     | 根 `store`，通过现有 API 同步                              |
| 悬浮按钮显隐、输入框焦点、组件展开状态       | 所属组件                                                   |
| 关闭面板后仍需恢复的 AI 任务、页面后台同步   | 页面或资源范围内稳定挂载的协调组件                         |
| 请求 URL、method、序列化、响应解析、SSE 协议 | 根 `api`                                                   |

局部状态应交给它的**最小稳定所有者**。例如把草稿移入 Dialog 后，仍需保持原先关闭、重开时的保留或重置行为；跨断点切换也不能无意重置状态。AI 任务协调组件不能跟着可见面板一起销毁。不能仅凭一个 Hook 的 import 数量决定归属。

RSS 样板先明确下面的挂载关系。这里表示运行时生命周期，不要求每个节点再建立一个目录：

```text
RssWorkspaceProvider                 进入 RSS 时建立，离开时释放
  RssTaskCoordinator                 同一任务唯一的恢复、订阅与回写所有者
  SourcesScope                       来源刷新状态与弹窗开关，跨布局保持
    AddSourceDialog                  保持组件实例，通过 visible 控制显隐
    CreateFolderDialog               草稿依旧属于这个组件
    ResponsiveWorkspace              这里只切换桌面/移动视图
      SourcesPanel
      ItemsPanel
      ArticlePanel / DigestPanel
      AssistantPanel
```

`SourcesScope` 与相关 Hook 仍放在 `SourcesPanel` 功能目录内，只承载需要跨布局保留的来源操作；它不接管表单草稿、正文选区或 AI 状态。任务协调与区域 Hook 不能重复订阅同一 job，也不能各自启动相同自动任务。协调组件只承担明确的长期副作用，不接收全页的 setter 集合。

### 三个具体修改场景

| 需求                           | 目标修改范围                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 给添加订阅表单增加一个展示字段 | Dialog 及其私有 Hook；协议变化时再改 `api/rss.ts`、`types/rss.ts`            |
| 调整 RSS 正文滚动标题          | `ArticlePanel` 内完成，不经过 SourcesPanel 或全页状态对象                    |
| 给书籍资源重命名增加校验       | 阅读页资源面板、`api/books.ts`、`types/books.ts` 以及后端 books 模块对应行为 |

API 和类型的集中存放是有意保留的边界；并不要求一个业务的所有文件必须物理放进同一个文件夹。

## 5. 阅读器按职责拆，保持运行时边界

阅读页在本页 `components` 内区分正文宿主、目录、工具栏、会话、资源、笔记、高亮和评论。资源面板的组件、私有 Hook、纯计算与测试靠近存放；不再把它们分散在 `components/right-panel` 和 `store/model`。

两项需要真正修改内部接口的工作：

1. 将标注会话状态与动作一起收进页面级 `useReaderAnnotations`，放在使用它的稳定协调组件同级。对外提供开始评论、保存、取消、跳转等操作，减少传入九个 setter 的动作工厂。
2. 在同一个 Foliate 目录内拆清选区控制、手势输入和事件装配；把仅用于该阅读器的 `util/epub/foliateReader.ts` 适配收回来。保留一个负责安装和清理监听的入口，不能让多个模块各自重复监听同一事件。

仍以 `book.id` 建立阅读器生命周期，最新参数通过稳定 ref 输入；CFI、导航队列、Overlayer、Paginator、srcdoc 兼容和源码变换维持现有协议。Foliate 复杂性需要独立验收，不与第一步 RSS 样板同时大改。

## 6. API、类型和工具的边界

**API 层保留本轮已完成的设计。** `api/rss.ts`、`books.ts`、`ai.ts` 等业务 class 负责请求；底层 transport 只供 API 内部使用。组件和 Hook 管理交互、加载与生命周期。暂不叠加 React Query、生成式客户端或另一层 Service。

**类型分清三种归属：**

- `src/types/<业务>.ts`：请求/响应协议，包括无正文、二进制、ETag 状态和 SSE 事件；类方法保持显式类型。
- `contracts/<业务>.d.ts`：前后端真正共用的实体与数据结构。逐步替代当前 `contracts/domain.d.ts` 总文件和 `src/types/domain.ts` 总转发入口，不重复定义同一实体。
- 组件内部 props、选区屏幕坐标、面板状态：留在对应组件或页面。`RightPanel`、只用于界面的 `ReaderSelection.rect` 不应因为“可能通用”进入服务端共享契约；跨页面确有复用的客户端阅读类型可以放 `src/types/reading.ts`。

**工具逐个看实际消费者。** 封面恢复回到书架，Foliate 专用适配回到阅读器，旧浏览器数据迁移跟随根 store。阅读主题、确有跨页用途的 EPUB 解析和格式化能力继续共享。不要再用 `common/helpers/utils` 接收暂时没想好归属的文件。

## 7. 后端让路由、实现与测试靠近

```text
server/
  index.ts                     进程与调度器生命周期
  app.ts                       构造依赖，按原顺序挂载 middleware/router
  config.ts
  http/                        Hono 请求解析、middleware、文件响应、静态兜底
  infrastructure/              跨业务文件原语和外部服务适配
  modules/
    books/
      routes.ts
      import.ts
      trash.ts
      notes.ts
      search.ts
      resources.ts
      *.test.mjs
    rss/
      routes.ts
      article.ts
      refresh.ts
      scheduler.ts
      providers/
      *.test.mjs
    videos/
    ai/                        任务、模型、工具与生图执行
    auth/
    settings/
    state/
      routes.ts
      stateStore.ts            state.json 唯一读写及串行提交入口
      serialization.ts
      compatibility/
      *.test.mjs
  tests/                       应用级鉴权、路由顺序、静态回退等集成测试
```

这是结合本项目提出的结构，不是对参考仓库的逐字复制。`service.ts`、`repository.ts`、`types.ts` 按实际职责创建；直接做一层转发的文件没有必要。

书籍图片的收藏和读取归 books，模型生图与知识地图执行归 AI。AI 工具通过书籍服务的明确函数读取材料和保存结果，避免 books 反向调用 AI 运行时。业务实现不接收 Hono Context；只有 `app.ts` 装配各模块 router。模块可以提供多个子 router，继续挂载原有 `/api/books`、`/api/search-indexes` 等前缀，不因为目录合并而改 API。

聚合状态的存储约束必须单独保留：

- books、rss、AI 等仍通过同一个 `stateStore` 更新 `state.json`，不各自读取全量文件再覆盖。
- 图片清单保存与书籍存在性检查继续使用原有串行边界，避免与删除竞态。
- 认证、Token、来源凭据文件现有的独立队列保持不变；不能把“state.json 唯一队列”扩展成全应用文件共用一把锁。
- `stateStore` 与序列化不能反向调用 books/RSS/AI 的有副作用业务服务，也不能在队列回调里再次入队。现有 `library/trashState`、`rss/stateProtection` 等纯合并规则可收进 `state/compatibility`，按原顺序执行。
- 路由顺序、Cookie、ETag、SSE、六个状态分区、persist key 和版本保持兼容。
- 测试搬入模块时，同步调整目前只扫描 `server-dist/*.test.mjs` 的发现机制，并核对用例数量，防止“命令通过但少跑测试”。

## 8. 样式和技术栈

继续使用 React、TypeScript、Vite、Semi、Tailwind、Zustand、Allotment、Foliate、Hono 和 Node 文件存储。当前结构问题没有提供换框架、引入数据库或拆 monorepo 的充分理由。

普通布局使用可读的 Tailwind utility；减少机械产生的长串任意值声明和重复覆盖。颜色仍取 Semi 与 reader 变量。富文本、EPUB iframe、第三方内部元素及确需级联的规则保留必要 CSS，并明确所属功能。

编号 CSS 的顺序目前属于级联契约。只在某个区域完成等价迁移后清理对应规则，逐步收敛到全局基准与明确命名的兼容样式；不能一次移除编号、移动媒体查询或强行归零 CSS。每次以现有固定容器里的截图对照验收。

## 9. 实施顺序与验收

| 阶段                      | 交付                                                                        | 验收重点                                                                              |
| ------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. RSS 样板               | 收拢 SourcesPanel、ItemsPanel、ArticlePanel；下放 Dialog 草稿；缩小页面接口 | 改一个表单不再穿过四个文件；关闭重开、断点切换、URL 直达/返回、滚动和任务恢复行为不变 |
| 2. 推广页面规则           | 书架、设置、视频，以及阅读器辅助面板按相同归属整理                          | 私有组件、Hook、计算和测试能在同一功能区域找到；共享 UI 不复制                        |
| 3. 收紧基础能力           | `util/state` 迁到根 store，清理单页 util，拆真正共享的类型                  | 唯一 persist、迁移、合并与同步语义保持；请求/响应类型完整                             |
| 4. 后端内聚               | 路由与模块测试归位，明确 books/AI/state 边界                                | 原 87 条路由注册记录、文件权限、状态队列和接口行为通过验证                            |
| 5. Foliate 专项与样式收尾 | 按生命周期职责拆复杂交互，逐区域清理重复样式                                | 真 EPUB 的 CFI、选区、高亮、翻页、面板调整及移动交互通过专项回归                      |

验收不以文件数减少或每个文件低于固定行数为目标。页面入口通常可控制在约 100–200 行，超出时人工审查职责；不能把剩余代码原封不动搬到 `usePage` 后宣布完成。尤其要检查是否仍有类似 RSS 的 150 字段返回对象，以及只改内部 UI 就必须传递大量 setter 的接口。

实施时更新边界检查，使它识别新的全局 store、组件归属和模块内 router。完成对应阶段后执行 `verify`；涉及页面、交互、样式或阅读器时执行 `verify:full`。保留现有 48 张固定环境截图、真实 EPUB、RSS/视频、API 协议与持久化回归；针对本次发现的 Dialog 草稿生命周期和区域切换补必要断言。测试数量发生变化时说明原因，不靠更新截图接受未经确认的 UI 变化。

建议首先只交付 **RSS 这一页的目录、状态归属和实际修改体验**，让你检查样板是否清楚，再推广到其他页面。这样下一轮验收能直接判断职责是否收敛，而不必等全仓库再次搬完才发现组织方式仍不合适。
