import type { McpTokenResponse } from '../../../types/settings';
import { settingsApi } from '../../../api/settings';
import { useEffect, useState } from 'react';
import { Button, Toast, Typography } from '@douyinfe/semi-ui';
import { confirmDialog } from '../../../util/confirmDialog';

import { libraryMcpTools, mcpConfig } from '../store/mcpConfig';

const { Title, Text } = Typography;

export function McpSettings() {
  const [credentials, setCredentials] = useState<McpTokenResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void settingsApi
      .readMcpToken()
      .then((value) => {
        if (active) setCredentials(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '读取 MCP 配置失败');
      });
    return () => {
      active = false;
    };
  }, []);
  const config = mcpConfig(window.location.origin, credentials?.token || '<请先生成 Token>');
  async function update(operation: 'generate' | 'revoke' | 'refresh') {
    setBusy(true);
    setError('');
    try {
      if (operation === 'generate') await settingsApi.generateOpenApiToken();
      else if (operation === 'revoke') await settingsApi.revokeOpenApiToken();
      setCredentials(await settingsApi.readMcpToken());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新 MCP 配置失败');
    } finally {
      setBusy(false);
    }
  }
  function changeToken(operation: 'generate' | 'revoke') {
    if (!credentials?.configured) {
      void update(operation);
      return;
    }
    confirmDialog({
      title:
        operation === 'generate' ? '重新生成 MCP / OpenAPI Token？' : '撤销 MCP / OpenAPI Token？',
      content: 'MCP 和 OpenAPI 共用此 Token，操作后旧配置立即失效。',
      onOk: () => update(operation),
    });
  }
  return (
    <div className="mcp-settings [gap:20px] min-w-0 [color:var(--semi-color-text-0)]">
      <section
        className="account-settings [margin-right:auto] [margin-left:auto] [padding:20px] [background:var(--semi-color-bg-1)] mobile:[padding:14px]"
        aria-labelledby="mcp-config-title"
      >
        <Title heading={5} id="mcp-config-title">
          MCP 连接配置
        </Title>
        <pre
          className="mcp-settings__config [margin:0] [padding:12px] [white-space:pre-wrap] [background:var(--semi-color-bg-0)]"
          aria-label="MCP 配置 JSON"
        >
          {config}
        </pre>
        <div className="mcp-settings__actions">
          <Button
            theme="solid"
            disabled={!credentials?.token || busy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(config);
                Toast.success('MCP 配置已复制');
              } catch {
                Toast.error('复制失败，请手动复制');
              }
            }}
          >
            复制配置 JSON
          </Button>
          <Button
            disabled={!credentials || busy}
            loading={busy}
            onClick={() => changeToken('generate')}
          >
            {credentials?.configured ? '重新生成 Token' : '生成 Token'}
          </Button>
          <Button
            type="danger"
            disabled={!credentials?.configured || busy}
            onClick={() => changeToken('revoke')}
          >
            撤销 Token
          </Button>
        </div>
        <Text type="tertiary" role="status">
          {credentials
            ? credentials.configured
              ? credentials.token
                ? '已配置，与 OpenAPI 共用 Token。'
                : '旧 Token 仅保存了摘要，请重新生成以获得完整配置。'
              : '尚未配置 Token，请先生成。'
            : error
              ? '配置读取失败'
              : '正在读取配置…'}
        </Text>
        {error && (
          <Text type="danger" role="alert">
            {error}
          </Text>
        )}
        {error && (
          <Button
            disabled={busy}
            onClick={() => {
              void update('refresh');
            }}
          >
            重试
          </Button>
        )}
        <Text type="tertiary">
          将 JSON 加入支持 Streamable HTTP 和自定义请求头的 MCP 客户端配置，即可直接连接，无需安装
          Node.js 或下载本地脚本。若客户端单独填写连接信息，使用 JSON 中的 URL 和 Authorization
          请求头。
        </Text>
        <Text type="tertiary">
          导入本机 EPUB 时，AI 客户端需先读取文件，再将文件名和 Base64 内容传给 upload_book（最大 10
          MiB）。较大文件可携带同一 Token 调用 POST /api/openapi/v1/books，使用 application/epub+zip
          直接上传文件（最大 100 MiB）。服务端无法读取客户端的本地路径。
        </Text>
        <Text type="tertiary" size="small">
          配置包含访问书架、笔记、高亮和评论的凭据，请妥善保存。Token
          仅保存在服务器数据目录；远程连接使用 HTTPS，客户端必须能访问配置中的服务地址。
        </Text>
      </section>
      <section
        className="account-settings [margin-right:auto] [margin-left:auto] [padding:20px] [background:var(--semi-color-bg-1)] mobile:[padding:14px]"
        aria-labelledby="mcp-library-title"
      >
        <Title heading={5} id="mcp-library-title">
          书架
        </Title>
        <Text type="tertiary">当前支持以下 8 个工具。AI 修改数据后，刷新应用即可查看。</Text>
        <ul className="mcp-settings__tools [list-style:none] [padding:0] [margin:0]">
          {libraryMcpTools.map(([name, title, description]) => (
            <li key={name}>
              <Text strong>{title}</Text>
              <code>{name}</code>
              <Text type="tertiary" size="small">
                {description}
              </Text>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
