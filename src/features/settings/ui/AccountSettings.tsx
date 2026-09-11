import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Toast, Typography } from '@douyinfe/semi-ui';
import { getAuthSession, logout, updateCredentials } from '../../../lib/auth';

const { Title, Text } = Typography;

export function AccountSettings() {
  const [remoteMode, setRemoteMode] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    void getAuthSession()
      .then((session) => {
        if (!active) return;
        setRemoteMode(session.mode === 'remote');
      })
      .catch((error) => Toast.error(error instanceof Error ? error.message : '无法读取账户信息'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      Toast.warning('新密码至少需要 8 个字符');
      return;
    }
    if (password !== confirmPassword) {
      Toast.warning('两次输入的新密码不一致');
      return;
    }
    setSaving(true);
    try {
      await updateCredentials({
        password,
      });
      setPassword('');
      setConfirmPassword('');
      Toast.success('密码已更新');
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '账户信息更新失败');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    if (!remoteMode) {
      Toast.info('当前为本地模式，没有登录会话需要退出');
      return;
    }
    setSigningOut(true);
    try {
      await logout();
      window.location.reload();
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '退出账号失败');
      setSigningOut(false);
    }
  };

  return (
    <form className="account-settings" aria-labelledby="account-settings-title" onSubmit={save}>
      <div className="account-settings__heading">
        <div>
          <Title id="account-settings-title" heading={5}>
            登录账户
          </Title>
          <Text size="small" type="tertiary">
            为当前账号设置新密码，更新后其他浏览器中的旧登录状态会立即失效
          </Text>
        </div>
      </div>
      <div className="account-settings__fields">
        <label className="settings-field">
          <Text size="small" strong>
            新密码
          </Text>
          <Input
            disabled={loading}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="至少 8 个字符"
          />
        </label>
        <label className="settings-field">
          <Text size="small" strong>
            确认新密码
          </Text>
          <Input
            disabled={loading}
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
        </label>
      </div>
      <div className="account-settings__footer">
        <Text size="small" type="tertiary">
          凭据保存在服务器数据目录，不会写入浏览器存储或构建产物。
        </Text>
        <Button
          disabled={loading || !password || !confirmPassword}
          htmlType="submit"
          loading={saving}
          theme="solid"
          type="primary"
        >
          更新密码
        </Button>
      </div>
      <div className="account-settings__logout">
        <Button
          block
          disabled={loading || saving}
          htmlType="button"
          loading={signingOut}
          theme="solid"
          type="danger"
          onClick={signOut}
        >
          退出账号
        </Button>
        {!remoteMode ? (
          <Text size="small" type="tertiary">
            当前为本地模式，没有登录会话需要退出
          </Text>
        ) : null}
      </div>
    </form>
  );
}
