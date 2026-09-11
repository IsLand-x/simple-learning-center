# 模块化架构设计

## 总体策略

采用增量式替换，不做一次性重写。每一步先锁定现有行为，再移动纯逻辑，最后拆分编排层。移动代码和改变行为不在同一步发生。

## 前端边界

```text
app -> features -> shared
  |        |
  +------> state -> persistence/sync
```

- `app`：启动、路由、Provider 和错误边界。
- `features`：library、reader、rss、video、settings、ai 的页面编排、领域 hooks 和 UI。
- `state`：单一 Zustand store 的领域 slice、迁移、合并与服务端同步。
- `shared`：无业务归属的 UI、API client、浏览器适配器和纯工具。
- `styles.css` 继续作为样式入口，内部按功能拆分并保持现有 class 与 Semi token。

页面负责路由和工作区编排；副作用由 hooks/application service 管理；展示组件通过 props 使用数据。桌面和移动端继续共享业务状态与阅读正文实例。

## 服务端边界

```text
HTTP routes -> application use cases -> domain rules
                                      <- infrastructure adapters
```

- 应用入口只组合 middleware、错误边界和领域路由。
- 领域路由只处理 HTTP 映射和输入校验。
- 应用服务负责编排状态、文件和远程调用。
- 文件系统、远程 HTTP、PiAgent、SSE 和调度器属于基础设施。
- 继续使用 Node 文件系统和原子写入，不引入外部数据库。

## 兼容性边界

- 保留 `/`、`/settings`、`/rss`、`/videos`、`/books/:bookId`。
- 保留全部 `/api` 路径、状态码、请求和响应结构、ETag、Cookie 与 SSE。
- 保留 `data/` 结构、`state.json` 语义、状态分区和删除墓碑逻辑。
- 保留 Foliate CFI、导航队列、Overlayer、手势和 Vite 源码变换。
- 保留服务端 AI 任务在浏览器断开后的运行和落盘语义。

## 验证策略

- 现有 `node:test` 作为服务端兼容基线。
- 为状态合并、迁移、阅读主题、RSS 纯逻辑增加单元测试。
- 为 HTTP 契约增加按领域的集成测试。
- 为书籍导入/恢复、阅读位置/高亮、RSS 详情/标注、视频字幕、AI 任务建立关键流程测试。
- 视觉回归覆盖 375、768、1024、1440 像素及浅色、深色模式。

## 风险控制

- Foliate 阅读器、RSS 工作台、状态同步和 AI SSE 是最高风险区域，最后拆分。
- 旧实现只有在新边界通过同一组测试后才能删除。
- 无法证明等价的兼容代码保留，并在任务清单中记录原因。
