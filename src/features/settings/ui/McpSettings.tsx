import { useEffect, useState } from 'react';
import { Button, Input, Toast, Typography } from '@douyinfe/semi-ui';
import { confirmDialog } from '../../../lib/confirmDialog';
import { requestOpenApiToken } from '../application/openApiToken';
import {
  downloadMcpClient,
  libraryMcpTools,
  mcpConfig,
  readMcpToken,
} from '../application/mcpConfig';

const { Title, Text } = Typography;

export function McpSettings() {
  const [credentials, setCredentials] = useState<{
    configured: boolean;
    token: string | null;
  } | null>(null);
  const [scriptPath, setScriptPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void readMcpToken()
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
  const config = mcpConfig(
    window.location.origin,
    credentials?.token || '<请先生成 Token>',
    scriptPath.trim() || '<本机连接脚本的绝对路径>',
  );
  async function update(method: 'POST' | 'DELETE' | 'GET') {
    setBusy(true);
    setError('');
    try {
      if (method !== 'GET') await requestOpenApiToken(method);
      setCredentials(await readMcpToken());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新 MCP 配置失败');
    } finally {
      setBusy(false);
    }
  }
  function changeToken(method: 'POST' | 'DELETE') {
    if (!credentials?.configured) {
      void update(method);
      return;
    }
    confirmDialog({
      title: method === 'POST' ? '重新生成 MCP / OpenAPI Token？' : '撤销 MCP / OpenAPI Token？',
      content: 'MCP 和 OpenAPI 共用此 Token，操作后旧配置立即失效。',
      onOk: () => update(method),
    });
  }
  return (
    <div className="mcp-settings">
      <section className="account-settings" aria-labelledby="mcp-config-title">
        <Title heading={5} id="mcp-config-title">
          MCP 连接配置
        </Title>
        <pre className="mcp-settings__config" aria-label="MCP 配置 JSON">
          {config}
        </pre>
        <div className="mcp-settings__actions">
          <Button
            theme="solid"
            disabled={!credentials?.token || busy || !scriptPath.trim()}
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
            onClick={() => changeToken('POST')}
          >
            {credentials?.configured ? '重新生成 Token' : '生成 Token'}
          </Button>
          <Button
            type="danger"
            disabled={!credentials?.configured || busy}
            onClick={() => changeToken('DELETE')}
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
              void update('GET');
            }}
          >
            重试
          </Button>
        )}
        <label className="settings-field">
          <Text strong>本机连接脚本路径</Text>
          <Input
            aria-label="本机连接脚本路径"
            placeholder="例如 /Users/me/Downloads/learning-center-mcp.mjs"
            value={scriptPath}
            onChange={setScriptPath}
          />
        </label>
        <Text type="tertiary">
          在 AI 所在电脑安装 Node.js 22.19 或更新版本，下载连接脚本，将其绝对路径填入上方，然后把
          JSON 加入支持 stdio 的 MCP 客户端配置。文件由本机脚本上传，无需把书籍正文放入模型上下文。
        </Text>
        <Button
          loading={downloading}
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            try {
              await downloadMcpClient();
            } catch (reason) {
              Toast.error(reason instanceof Error ? reason.message : '下载连接脚本失败');
            } finally {
              setDownloading(false);
            }
          }}
        >
          下载本地连接脚本
        </Button>
        <Text type="tertiary" size="small">
          配置包含访问书架、笔记、高亮和评论的凭据，请妥善保存。Token
          仅保存在服务器数据目录；远程连接使用 HTTPS，客户端必须能访问配置中的服务地址。
        </Text>
      </section>
      <section className="account-settings" aria-labelledby="mcp-library-title">
        <Title heading={5} id="mcp-library-title">
          书架
        </Title>
        <Text type="tertiary">当前支持以下 8 个工具。AI 修改数据后，刷新应用即可查看。</Text>
        <ul className="mcp-settings__tools">
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
