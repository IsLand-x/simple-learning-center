# EPUB 测试夹具

- `openapi-sample.epub` 是原有单章最小夹具，用于 OpenAPI 与 MCP 契约测试。
- `reader-regression.epub` 是两章、每章 40 段的阅读器回归夹具。全部中文文字为本测试编写，内容及元数据可在 `generate-reader-regression.mjs` 中审查；没有个人书籍、第三方版权正文、联网资源或字体文件。

使用 Node.js 内置 API 确定性生成阅读器夹具，无需安装其他依赖：

```bash
node tests/fixtures/generate-reader-regression.mjs
```

固定 ZIP 时间戳、文件顺序及内容确保相同脚本生成相同字节。`foliate-runtime.spec.ts` 通过真实上传接口与 Foliate 运行时验证目录、分页和 CFI 恢复；测试不会连接第三方内容服务。
