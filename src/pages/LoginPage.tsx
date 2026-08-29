import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { getCaptcha, login, type CaptchaChallenge } from '../lib/auth';

const { Title, Text } = Typography;

export function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refreshCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      setChallenge(await getCaptcha());
      setCaptcha('');
    } catch (captchaError) {
      setChallenge(null);
      setError(captchaError instanceof Error ? captchaError.message : '验证码加载失败');
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    void refreshCaptcha();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (!challenge) throw new Error('验证码尚未加载，请刷新后重试');
      await login(username.trim(), password, challenge.id, captcha.trim());
      onAuthenticated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败，请稍后重试');
      await refreshCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-card__heading">
          <Text className="login-card__eyebrow" size="small" type="tertiary">安全访问</Text>
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
        <label className="settings-field">
          <Text size="small" strong>验证码</Text>
          <div className="login-captcha">
            <Input
              autoComplete="off"
              inputMode="numeric"
              maxLength={4}
              value={captcha}
              onChange={(value) => setCaptcha(value.replace(/\D/g, '').slice(0, 4))}
              placeholder="四位数字"
            />
            <button
              aria-label="刷新验证码"
              className="login-captcha__image"
              disabled={captchaLoading}
              type="button"
              onClick={() => void refreshCaptcha()}
            >
              {challenge ? <img alt="验证码" draggable={false} src={challenge.image} /> : <span>加载中</span>}
            </button>
            <Tooltip content="刷新验证码">
              <Button
                aria-label="刷新验证码"
                icon={<IconRefresh spin={captchaLoading} />}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => void refreshCaptcha()}
              />
            </Tooltip>
          </div>
        </label>
        <div className="login-card__message" aria-live="polite">
          {error ? <Text size="small" type="danger">{error}</Text> : null}
        </div>
        <Button
          block
          disabled={!username.trim() || !password || captcha.length !== 4 || !challenge}
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
