# 架构

React 18 / TypeScript / Vite 前端，Node.js / Hono 数据服务，用户数据在独立目录。UI 使用 Semi Design、Tailwind、Zustand、Allotment 和 Foliate.js。EPUB 运行时用 Foliate.js；epub.js 只负责导入元数据和封面。AI 使用 PiAgent，浏览器不直连模型供应商。

前端产物在 `dist/`，后端产物在 `server-dist/`。`contracts/` 放前后端共用类型。

## 目录

- `src/layout/`：外壳、登录、路由和启动。路由保持 lazy loading 与 `StateDomainGate`。
- `src/pages/`：`books/list`、`books/detail`、`books/share`、`settings`。页面私有组件留在该页。
- `src/components/`：多页复用的 UI，不引用页面私有实现。
- `src/api/<domain>/`：`index.ts` 与 `type.ts`。组件不直接 fetch。
- `src/store/`：唯一 Zustand persist。key 为 `learning-center-state-v1`。页面 store 不另存一份服务器数据。
- `src/util/`：跨页面工具，不依赖页面或 store。
- `server/modules/`：books、ai、auth、settings、state。只有 `server/app.ts` 挂载路由。
- `server/db/`：SQLite schema 与状态读写。业务模块通过 `server/modules/state` 访问。
- `server/infrastructure/`：无业务归属的文件和 HTTP 原语。

每个生产 TSX 只定义一个组件。检查用 `npm run check:components` 和 `npm run check:boundaries`。

## 状态

活动分区是 library、reading、notes、highlights、conversations、preferences。每个持久化字段只属于一个分区。客户端按路由加载分区，并用 ETag 避免未变化的分区重复下载。

服务端用单实例写队列。书籍删除、回收站、高亮删除记录、未知扩展字段和多设备合并都在这把队列里完成。笔记正文在 `data/notes/`，只有笔记写入才协调 Markdown 文件。

SQLite（`data/learning-center.db`，WAL）是唯一运行时权威。正常 GET、PUT 和 AI 状态写入只读写数据库，不再序列化 `state.json`。数据库已有版本、导入标记、任意业务表或非保留键值后，JSON 不再被读取。损坏的库文件会阻止启动，不会被旧 JSON 换掉。

`state.json` 只用于旧目录首次导入：

- 数据库尚未初始化且 JSON 可读：在同一个事务里导入并写入 `__stateJsonImport`。
- JSON 损坏或导入失败：进程退出，不写完成标记，修复后重启会重试。
- 数据库已经有效：跳过，即使 JSON 更新或字段跟踪缺失。
- 不删除旧 JSON。新安装不创建它。

健康检查看数据库是否已有状态，不看 JSON 是否存在。

阅读位置使用独立的 `locationUpdatedAt`。改名、置顶和存档只更新各自的时钟，不能改写进度。没有该字段的旧记录仍按整书 `updatedAt` 比较；已有位置时钟的记录不会被缺字段的旧客户端换掉。术语和高亮按更新时间与删除记录合并。打开中的阅读器不因远端进度跳页。打开、旋转、分栏和字体变化产生的 Foliate `anchor` / `navigation` 回声不写入位置；用户翻页（`page` / `snap` / `scroll`）和主动目录跳转仍会保存，包括第一次真实翻页。

刷新与本地写入重叠时，笔记、高亮和书架会合并，并丢掉该分区 ETag，下一次在写入结束后开始的刷新再记下新 ETag。阅读会话和偏好不在重叠响应里按字段合并，连续本地写入会推迟它们，直到一次安静刷新。打开或重排阅读器不再在每次刷新时写书架。

备份和恢复使用 SQLite 在线 backup API（`server/db/sqliteBackup.ts`）。备份包含 WAL 中已提交的帧。恢复先生成一致的库文件，再替换主库并删除 `-wal` 与 `-shm`。数据库不是完整应用备份：Markdown 笔记、EPUB、封面、凭据、TTS、OAuth、OpenAPI Token、分享、COS 和图床配置、视频 `jobs.json` 仍是独立文件。

旧浏览器存储只在服务端还没有状态时迁移一次。persist key 保持 `learning-center-state-v1`。版本号只在需要转换旧数据时增加。

## 边界

- 页面之间不互引私有实现。共享 UI 放 components，共享能力放 util。
- API、contracts 和 `types` 不依赖 React 或服务端运行时。
- `server/db` 不依赖业务模块。业务模块不直接导入 `server/db`。
- books 不导入 AI 运行时。状态模块不导入其他业务模块。
- 不要把 API Key、书籍正文或笔记发给用户未选择的第三方。
- 不要手改 `dist/` 或 `server-dist/`，不要提交 `data/`。

## 验证与发布

`npm run verify` 包含 lint、格式、组件、边界、死代码、前后端测试和前端构建。服务端测试会先编译一次。`npm run verify:full` 再用固定 Docker 浏览器跑 E2E。

推送到 `main` 后，CI 验证通过才构建生产镜像并部署。部署保留现有数据目录，失败回滚上一个镜像摘要。
