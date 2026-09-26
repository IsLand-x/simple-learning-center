import { Button, Tag, Typography } from '@douyinfe/semi-ui';
import { confirmDialog } from '../../../util/confirmDialog';
import { useOAuthProviders, oauthProviderLabels } from '../store/hooks/useOAuthProviders';

const { Text } = Typography;

export function OAuthProviders() {
  const { providers, busy, error, action } = useOAuthProviders();
  return (
    <section
      className="oauth-providers min-w-0 [color:var(--semi-color-text-0)] [margin-bottom:24px]"
      aria-label="OAuth 账号登录"
    >
      <Text strong>账号授权登录</Text>
      <Text type="tertiary" size="small">
        登录后会加入供应商与模型选择器。授权凭据仅保存在服务器数据目录，自动刷新，不包含在 API Key
        导出中。
      </Text>
      {error && (
        <div role="alert">
          <Text type="danger">{error}</Text>
        </div>
      )}
      {!providers.length && (
        <Text type="tertiary">{error ? '授权状态暂不可用，正在重试…' : '正在读取授权状态…'}</Text>
      )}
      {providers.map((provider) => {
        const pending = provider.login?.state === 'pending';
        return (
          <article
            className="api-config-card [grid-template-columns:repeat(2,_minmax(0,_1fr))] [padding:18px] [background:var(--semi-color-bg-1)] [@media(max-width:860px)]:[grid-template-columns:1fr] mobile:[padding:14px] oauth-provider min-w-0 [color:var(--semi-color-text-0)]"
            key={provider.id}
          >
            <div className="oauth-provider__heading">
              <Text strong>{oauthProviderLabels[provider.id]}</Text>
              <Tag color={provider.connected ? 'green' : 'grey'}>
                {provider.connected ? '已登录' : '未登录'}
              </Tag>
            </div>
            <Text type="tertiary" size="small">
              {provider.id === 'openai-codex'
                ? '使用 ChatGPT 账号的 Codex 权益；请先在 ChatGPT 安全设置中启用设备码登录。'
                : '使用 Kimi Coding 权益，可用模型与额度取决于账号授权。'}
            </Text>
            {pending && (
              <div
                className="oauth-provider__authorization min-w-0 [color:var(--semi-color-text-0)]"
                aria-live="polite"
              >
                {provider.login?.userCode && (
                  <Text strong>设备验证码：{provider.login.userCode}</Text>
                )}
                <Text type="secondary">
                  {provider.login?.url
                    ? '打开官方授权页并输入验证码，完成后此页自动更新。'
                    : '正在获取设备验证码…'}
                </Text>
                {provider.login?.url && (
                  <a href={provider.login.url} target="_blank" rel="noopener noreferrer">
                    打开官方授权页
                  </a>
                )}
              </div>
            )}
            {provider.login?.state === 'failed' && (
              <Text type="danger" role="alert">
                {provider.login.message}
              </Text>
            )}
            {provider.connected && (
              <Text type="tertiary" size="small">
                已提供 {provider.models.length} 个模型，可在 AI 助手中选择。
              </Text>
            )}
            <div className="oauth-provider__actions">
              {pending ? (
                <Button disabled={busy !== null} onClick={() => void action(provider.id, 'cancel')}>
                  取消授权
                </Button>
              ) : (
                <Button
                  theme="solid"
                  type="primary"
                  loading={busy === provider.id}
                  disabled={busy !== null}
                  onClick={() => void action(provider.id, 'login')}
                >
                  {provider.connected ? '重新登录' : `登录 ${oauthProviderLabels[provider.id]}`}
                </Button>
              )}
              {provider.connected && !pending && (
                <Button
                  type="danger"
                  theme="borderless"
                  disabled={busy !== null}
                  onClick={() =>
                    confirmDialog({
                      title: `退出 ${oauthProviderLabels[provider.id]}？`,
                      content:
                        '只删除服务器数据目录中的授权凭据，保留模型配置和对话历史。再次使用前需要重新登录。',
                      okText: '退出登录',
                      cancelText: '取消',
                      okButtonProps: { type: 'danger' },
                      onOk: () => action(provider.id, 'logout'),
                    })
                  }
                >
                  退出登录
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
