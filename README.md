# 学习中心

本地优先的 EPUB 阅读器，包含书架、目录、划线、笔记，以及通过 ACP 连接本地 Codex / Kimi CLI 的 AI 助手。

## 本地运行

```bash
npm install
npm run dev:local
```

打开 `http://127.0.0.1:5173/`。`dev:local` 会同时启动 Vite 和仅监听 `127.0.0.1` 的 ACP 桥接服务。

- Codex 默认通过 `npx --yes @zed-industries/codex-acp` 启动，请先完成 Codex 登录。
- Kimi 通过 `kimi acp` 启动，请先安装 Kimi CLI 并运行 `kimi login`。
- 阅读器不会自动批准本地工具操作；ACP 助手发起的文件或终端权限请求会被拒绝。

如本机命令位置不同，可通过 `LEARNING_CENTER_CODEX_ACP_COMMAND`、`LEARNING_CENTER_CODEX_ACP_ARGS`、`LEARNING_CENTER_KIMI_ACP_COMMAND` 和 `LEARNING_CENTER_KIMI_ACP_ARGS` 覆盖；`*_ARGS` 的值为 JSON 字符串数组。

线上部署只包含阅读器界面，浏览器无法从托管站点直接启动本机 CLI；使用 AI 助手时请运行本地版本。
