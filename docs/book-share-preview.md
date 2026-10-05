# 书籍分享预览

分享功能分支为 `codex/book-sharing`，阅读器修复分支为 `codex/reader-content-fixes`，共用这份独立预览部署流程。推送触发工程验证和“书籍分享预览镜像”，镜像标记为 `ghcr.io/island-x/simple-learning-center:book-share-<完整提交 SHA>`，不更新 latest 或生产服务。

独立容器 `learning-center-book-share-preview`、数据卷 `learning-center-book-share-preview-data` 和私有环境文件 `/home/orca/.local/share/learning-center-book-share-preview.env` 与所有既有实例隔离。服务仅监听 `127.0.0.1:4178`，采用远程认证，凭据文件权限 0600。示例仅使用仓库原创 `tests/fixtures/reader-regression.epub`；不复制真实书籍、笔记、阅读记录或供应商凭据。

镜像验证完成后部署：

```bash
bash deploy/book-share-preview.sh \
  ghcr.io/island-x/simple-learning-center:book-share-<完整提交 SHA> \
  /home/orca/.local/share/learning-center-book-share-preview.env
```

预览 HTTPS 地址为 https://learning-center.orca.island-x.autos，现有 Nginx 预览入口需代理至 `http://127.0.0.1:4178`。保留原入口配置备份；不修改 Vercel DNS、证书或生产入口。通过原创建书籍接口导入原创 EPUB 并创建分享链接，用无会话浏览器访问 `/share/<token>` 验证封面、下载、预览和撤销。匿名用户无权访问 `/api/state/*`、`/api/books/*` 或 AI 接口。

停止服务并保留示例数据：

```bash
docker stop learning-center-book-share-preview
```

验收结束后先恢复预览 Nginx 入口配置并通过 `nginx -t`，然后删除本实例：

```bash
docker rm learning-center-book-share-preview
docker volume rm learning-center-book-share-preview-data
```

仅清理本页命名的容器、卷和私有凭据文件，不影响其他服务。
