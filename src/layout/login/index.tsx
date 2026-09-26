import { IconMoon, IconSun } from '@douyinfe/semi-icons';
import { Button, Input, Tooltip, Typography } from '@douyinfe/semi-ui';
import { useLoginStore } from './store/useLoginStore';

const { Title, Text } = Typography;

export function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const {
    username,
    setUsername,
    password,
    setPassword,
    themeMode,
    setThemeMode,
    error,
    submitting,
    submit,
  } = useLoginStore(onAuthenticated);

  return (
    <main className="login-page relative w-full [padding:24px] [place-items:center] [background:linear-gradient(145deg,_var(--semi-color-bg-0),_var(--semi-color-fill-0))] [@media(max-width:480px)]:[padding:16px]">
      <div className="login-page__theme-switch fixed [top:20px] [right:20px] [z-index:1] [@media(max-width:480px)]:[top:12px] [@media(max-width:480px)]:[right:12px]">
        <Tooltip content={themeMode === 'light' ? '切换为深色主题' : '切换为浅色主题'}>
          <Button
            aria-label={themeMode === 'light' ? '切换为深色主题' : '切换为浅色主题'}
            icon={themeMode === 'light' ? <IconMoon /> : <IconSun />}
            theme="borderless"
            type="tertiary"
            onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
          />
        </Tooltip>
      </div>
      <form
        className="login-card [width:min(100%,_420px)] [gap:20px] [padding:32px] [background:var(--semi-color-bg-1)] [box-shadow:var(--semi-shadow-elevated)] [@media(max-width:480px)]:[padding:24px_20px]"
        onSubmit={submit}
      >
        <div className="login-card__heading [gap:6px] [margin-bottom:4px]">
          <Title heading={3}>欢迎回来</Title>
          <Text type="tertiary">请输入登录信息继续访问</Text>
        </div>
        <label className="settings-field min-w-0 [gap:6px] [@media(max-width:860px)]:[grid-column:1_/_-1]">
          <Text size="small" strong>
            账号
          </Text>
          <Input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={setUsername}
            placeholder="请输入账号"
          />
        </label>
        <label className="settings-field min-w-0 [gap:6px] [@media(max-width:860px)]:[grid-column:1_/_-1]">
          <Text size="small" strong>
            密码
          </Text>
          <Input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="请输入密码"
          />
        </label>
        <div className="login-card__message [min-height:20px] [margin-top:-8px]" aria-live="polite">
          {error ? (
            <Text size="small" type="danger">
              {error}
            </Text>
          ) : null}
        </div>
        <Button
          block
          disabled={!username.trim() || !password}
          htmlType="submit"
          loading={submitting}
          theme="solid"
          type="primary"
        >
          登录
        </Button>
      </form>
    </main>
  );
}
