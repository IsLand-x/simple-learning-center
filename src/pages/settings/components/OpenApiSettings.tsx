import { useEffect, useState } from 'react';
import { Button, Input, Toast, Typography } from '@douyinfe/semi-ui';
import { confirmDialog } from '../../../util/confirmDialog';
import { requestOpenApiToken, type OpenApiTokenStatus } from '../store/openApiToken';

const { Title, Text } = Typography;

export function OpenApiSettings() {
  const [status, setStatus] = useState<OpenApiTokenStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void requestOpenApiToken()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '读取 Token 状态失败');
      });
    return () => {
      active = false;
    };
  }, []);

  async function update(method: 'GET' | 'POST' | 'DELETE') {
    setBusy(true);
    setError('');
    try {
      setStatus(await requestOpenApiToken(method));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新 Token 失败');
    } finally {
      setBusy(false);
    }
  }

  function confirmUpdate(method: 'POST' | 'DELETE') {
    if (!status?.configured) {
      void update(method);
      return;
    }
    confirmDialog({
      title: method === 'POST' ? '重新生成 OpenAPI Token？' : '撤销 OpenAPI Token？',
      content: '当前 Token 将立即失效，使用它的外部工具将无法继续调用开放接口。',
      onOk: () => update(method),
    });
  }

  return (
    <section
      className="account-settings [margin-right:auto] [margin-left:auto] [padding:20px] [background:var(--semi-color-bg-1)] mobile:[padding:14px] openapi-settings"
      aria-labelledby="openapi-settings-title"
    >
      <div className="account-settings__heading justify-between [gap:16px]">
        <div>
          <Title heading={5} id="openapi-settings-title">
            OpenAPI
          </Title>
          <Text type="tertiary">为脚本和外部工具生成访问凭据，后续开放接口统一使用此 Token。</Text>
        </div>
      </div>
      <Text role="status">
        {status
          ? status.configured
            ? '已配置 Token'
            : '尚未配置 Token'
          : error
            ? '无法读取状态'
            : '正在读取状态…'}
      </Text>
      {error && (
        <Text type="danger" role="alert">
          {error}
        </Text>
      )}
      {!status && error && (
        <Button
          disabled={busy}
          loading={busy}
          onClick={() => {
            void update('GET');
          }}
        >
          重试
        </Button>
      )}
      {status?.token && (
        <div className="openapi-settings__token [align-items:end]">
          <label className="settings-field min-w-0 [gap:6px] [@media(max-width:860px)]:[grid-column:1_/_-1]">
            <Text strong>新 Token</Text>
            <Input aria-label="OpenAPI Token" value={status.token} readonly />
          </label>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(status.token || '');
                Toast.success('Token 已复制');
              } catch {
                Toast.error('复制失败，请手动复制');
              }
            }}
          >
            复制 Token
          </Button>
        </div>
      )}
      <Text type="tertiary" size="small">
        请妥善保存。MCP 与 OpenAPI 共用此 Token，可在 MCP 页重新查看连接配置。
      </Text>
      <div className="openapi-settings__actions [align-items:end]">
        <Button
          theme="solid"
          disabled={!status || busy}
          loading={busy}
          onClick={() => confirmUpdate('POST')}
        >
          {status?.configured ? '重新生成 Token' : '生成 Token'}
        </Button>
        <Button
          type="danger"
          disabled={!status?.configured || busy}
          onClick={() => confirmUpdate('DELETE')}
        >
          撤销 Token
        </Button>
      </div>
      <Text strong>导入 EPUB</Text>
      <Text type="tertiary">
        使用 POST /api/openapi/v1/books，携带 Authorization: Bearer &lt;Token&gt;，Content-Type 为
        application/epub+zip，请求正文直接传入 EPUB 文件（最大 100 MiB）。导入后刷新书架查看。
      </Text>
      <Text type="tertiary" size="small">
        可通过 filename 查询参数指定文件名。远程调用请使用 HTTPS；Token
        不能用于管理设置或读取应用私有接口。
      </Text>
    </section>
  );
}
