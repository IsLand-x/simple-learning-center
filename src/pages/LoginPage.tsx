import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconMoon, IconSun } from '@douyinfe/semi-icons';
import { applyAppTheme, readInitialThemeMode } from '../lib/appTheme';
import { login } from '../lib/auth';

const { Title, Text } = Typography;

export function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [themeMode, setThemeMode] = useState(readInitialThemeMode);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    applyAppTheme(themeMode);
  }, [themeMode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      onAuthenticated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-page__theme-switch">
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
      <form className="login-card" onSubmit={submit}>
        <div className="login-card__heading">
          <Title heading={3}>欢迎回来</Title>
          <Text type="tertiary">请输入登录信息继续访问</Text>
        </div>
        <label className="settings-field">
          <Text size="small" strong>账号</Text>
          <Input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={setUsername}
            placeholder="请输入账号"
          />
        </label>
        <label className="settings-field">
          <Text size="small" strong>密码</Text>
          <Input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="请输入密码"
          />
        </label>
        <div className="login-card__message" aria-live="polite">
          {error ? <Text size="small" type="danger">{error}</Text> : null}
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
