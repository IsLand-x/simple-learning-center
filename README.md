# 学习中心

本地优先的个人 EPUB 阅读与 AI 学习应用。浏览器只访问同源 API；书籍、笔记、进度、高亮、对话和模型配置保存在服务器数据目录。

## 功能

- 导入 EPUB，书架支持置顶、存档、书单和回收站。
- Foliate.js 阅读器保存 CFI、进度、高亮、评论和术语。多设备按修改时间合并，打开中的阅读器不会被远端进度强制跳页。
- Markdown 笔记、章节思维导图、章节讲解视频和阅读轨迹。
- AI 阅读助手使用已配置的 OpenAI 兼容接口，可在服务端继续运行；进程重启会中断尚未完成的任务。
- 设置页管理模型、搜索、TTS、账户、OpenAPI Token 和 MCP。

## 数据

默认目录是仓库下的 `data/`，可用 `LEARNING_CENTER_DATA_DIR` 改到其他路径。

```text
data/
├── learning-center.db          # 状态的唯一运行时权威（WAL）
├── learning-center.db-wal      # SQLite 预写日志，备份时不要单独拷走
├── state.json                  # 仅旧数据首次导入；导入后保留，不再读写
├── auth.json                   # 登录凭据
├── ai-oauth.json               # OAuth 凭据（0600）
├── tts.json                    # 语音配置（0600）
├── openapi-token.json          # OpenAPI / MCP Token（0600）
├── book-shares.json            # 分享令牌
├── cos-images.json             # 可选 COS 图床配置
├── books/                      # EPUB
├── covers/                     # 封面
├── notes/                      # Markdown 正文
├── knowledge-maps/             # 生成图片与收藏清单
├── chapter-videos/             # 视频、封面和 jobs.json
└── search-indexes/             # 书内搜索索引
```

SQLite 保存书架、进度、高亮、术语、笔记元数据、对话和模型配置。笔记正文、EPUB、封面、凭据、分享、图床和视频任务记录仍是独立文件，不塞进数据库。

已有 `state.json` 且数据库还没有任何用户数据时，启动会导入一次，并在同一事务里写下完成标记。用户数据包括版本、导入标记、任意业务表，以及主题等非保留键值。导入失败会停止启动，修文件后重试；不会删除旧 JSON。数据库已经有效时，即使 JSON 更新、多了旧字段或书更多，也不会覆盖。损坏的库文件不会被静默换成 JSON。新安装不再生成 `state.json`。

浏览器里的旧 `learning-center-state-v1` 只在服务端还没有状态时迁移一次，迁移后仍留在浏览器里。`localhost` 和 `127.0.0.1` 是不同来源。

在线备份使用 SQLite backup API，会包含尚未检查点的 WAL。先构建服务端：

```bash
npm run build:server
node server-dist/db/sqliteBackup.js backup /path/to/learning-center.db
```

恢复会替换数据库并删除残留的 `-wal`、`-shm`，避免旧日志重放到新库上。恢复前停止服务：

```bash
node server-dist/db/sqliteBackup.js restore /path/to/learning-center.db
```

不要在服务运行时只复制 `learning-center.db` 主文件。停机后复制整个 `data/` 目录仍然可以。只备份数据库不能还原笔记正文、EPUB、封面、凭据和视频任务。

## 启动

需要 Node.js `>=22.19.0`。

```bash
npm install
npm start          # 构建并监听 http://127.0.0.1:4174/
npm run dev        # 数据服务 + Vite，http://127.0.0.1:5173/
npm test
npm run verify
```

本地模式只绑定 `127.0.0.1`。远程模式监听所有接口，必须放在 HTTPS 反向代理后：

```bash
LEARNING_CENTER_MODE=remote \
LEARNING_CENTER_PASSWORD='请替换为足够长的密码' \
LEARNING_CENTER_DATA_DIR=/srv/learning-center-data \
npm start
```

| 变量                       | 默认       | 说明                         |
| -------------------------- | ---------- | ---------------------------- |
| `LEARNING_CENTER_MODE`     | `local`    | `remote` 时开启登录          |
| `LEARNING_CENTER_USERNAME` | `admin`    | 首次初始化账号               |
| `LEARNING_CENTER_PASSWORD` | `password` | 首次初始化密码，公网必须修改 |
| `LEARNING_CENTER_PORT`     | `4174`     | 端口                         |
| `LEARNING_CENTER_DATA_DIR` | `./data`   | 数据目录                     |

登录后在设置里修改的密码写入 `auth.json`，优先于环境变量。

Docker：

```bash
cp .env.example .env
mkdir -p /srv/learning-center-data
docker compose up -d --build
```

镜像只把 `/data` 挂到宿主机。升级时重新 `docker compose up -d --build`，不要覆盖数据目录。Linux 上目录不可写时，把 `LEARNING_CENTER_UID` 和 `LEARNING_CENTER_GID` 设为当前用户。

`main` 推送后，CI 验证通过会构建镜像并部署到 `https://learning-center.island-x.autos`。生产数据在 `/srv/learning-center-data`，失败时回滚上一个镜像摘要。可选 CDN 只分发带哈希的 `/assets/`，不上传书籍或密钥。独立预览只在明确要求时使用，见 `docs/preview.md`。

## AI、OpenAPI 与 MCP

模型与搜索密钥存在 SQLite 的偏好分区，由服务端代发请求，浏览器不直连供应商。检测模型只发送 API Key，最长 15 秒，不跟随重定向。

OpenAPI Token 在设置页生成，只授权 `/api/openapi/`。上传 EPUB：

```bash
curl --fail-with-body -X POST \
  'http://127.0.0.1:4174/api/openapi/v1/books?filename=example.epub' \
  -H "Authorization: Bearer $LC_OPENAPI_TOKEN" \
  -H 'Content-Type: application/epub+zip' \
  --data-binary '@example.epub'
```

最大 100 MiB。同一文件重复调用会创建多本书。MCP 与 OpenAPI 共用 Token，在设置页复制 Streamable HTTP 配置。

## 开发约定

目录、状态分区、阅读器和界面规则见 [AGENTS.md](AGENTS.md) 与 [docs/architecture.md](docs/architecture.md)。
