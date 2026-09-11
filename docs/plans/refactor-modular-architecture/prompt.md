# 完全重构执行 Prompt

你是一名资深全栈架构师，请对 Learning Center 进行行为保持型的完整重构。

目标是在不改变任何用户可见界面、交互、页面路由、HTTP API、Cookie、ETag、SSE、数据目录、持久化数据与安全边界的前提下，把现有 React + Node 应用整理为可测试、可维护的模块化单体。重构必须保留 React 18、TypeScript、Vite、Semi Design、Zustand、Foliate.js、Allotment、PWA、Hono、PiAgent 和 Node 文件系统存储；不得引入多用户、云同步、外部数据库或第二套 UI/状态/阅读器实现。

执行时遵守以下原则：

1. 先锁定现有测试、构建、文件热点、状态版本和外部契约，再移动代码。
2. 前端按 `app -> pages -> features -> shared/lib/types` 组织；页面只负责路由与工作区编排，领域副作用进入 application hooks，纯计算进入 model，展示进入 ui。
3. 保留单一 Zustand store 公共入口，把默认值、领域 actions、迁移、合并与服务端同步拆开；persist key 和版本语义不得改变。
4. 服务端入口只组合 middleware、错误边界和领域路由；路由保持稳定顺序，并继续调用现有存储、内容源、AI 和安全模块。
5. Foliate.js、CFI、Paginator、Overlayer、移动选区和导航队列属于高风险兼容边界，只做等价提取，并通过类型和回归测试验证。
6. CSS 按令牌、基础外壳和领域拆分，保持原选择器、规则顺序、Semi token、响应式断点与明暗主题效果不变。
7. 新代码使用严格 TypeScript、函数组件、语义化 class、明确 props 与领域类型；避免 `any`、重复状态、跨 feature 深层依赖、无作用域样式和隐式数据迁移。
8. 每个阶段运行对应测试；最终必须通过 ESLint、Prettier、模块边界、Knip dead-code、服务端测试、前端单元测试、TypeScript、Vite/PWA 构建、桌面/移动 Chrome 回归和 `git diff --check`。

输出应包含重构映射、兼容性说明、验证证据和仍需人工覆盖的真实外部集成风险。不要部署、提交或修改远程环境。
