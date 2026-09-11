import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconVideo } from '@douyinfe/semi-icons';
import { confirmDialog } from '../../../lib/confirmDialog';
import {
  deleteSavedBilibiliCookie,
  getBilibiliCredentialStatus,
  saveBilibiliCookie,
  verifySavedBilibiliCookie,
  type BilibiliCredentialStatus,
} from '../../../lib/rssApi';

const { Title, Text } = Typography;

export function ContentSourceSettings() {
  const [status, setStatus] = useState<BilibiliCredentialStatus>();
  const [cookie, setCookie] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const load = async () => {
    try {
      setStatus(await getBilibiliCredentialStatus());
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '无法读取内容源凭据状态');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!cookie.trim()) return;
    setSaving(true);
    try {
      const next = await saveBilibiliCookie(cookie);
      setStatus(next);
      setCookie('');
      if (next.verificationStatus === 'valid') Toast.success('B站 Cookie 已保存并验证');
      else Toast.warning(next.message || 'Cookie 已保存，但暂时无法完成验证');
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : 'B站 Cookie 保存失败');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    try {
      const next = await verifySavedBilibiliCookie();
      setStatus(next);
      if (next.verificationStatus === 'valid') Toast.success('B站 Cookie 有效');
      else Toast.warning(next.message || 'B站 Cookie 无效');
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : 'B站 Cookie 验证失败');
      await load();
    } finally {
      setVerifying(false);
    }
  };

  const remove = () =>
    confirmDialog({
      title: '删除 B站 Cookie？',
      content: '只会删除服务器数据目录中的 B站凭据。需要 Cookie 的 UP 主订阅可能无法继续刷新。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        setStatus(await deleteSavedBilibiliCookie());
        setCookie('');
        Toast.success('B站 Cookie 已删除');
      },
    });

  const statusLabel = !status?.configured
    ? '未配置'
    : status.verificationStatus === 'valid'
      ? '验证有效'
      : status.verificationStatus === 'invalid'
        ? '疑似失效'
        : '尚未验证';
  const statusColor =
    status?.verificationStatus === 'valid'
      ? 'green'
      : status?.verificationStatus === 'invalid'
        ? 'red'
        : 'amber';

  return (
    <section className="content-source-settings" aria-labelledby="content-source-settings-title">
      <div className="content-source-settings__heading">
        <div className="content-source-settings__identity">
          <IconVideo size="large" />
          <div>
            <Title id="content-source-settings-title" heading={5}>
              B站访问凭据
            </Title>
            <Text size="small" type="tertiary">
              用于需要登录态或触发风控后的 UP 主投稿抓取
            </Text>
          </div>
        </div>
        <Tag color={statusColor} size="small">
          {loading ? '读取中' : statusLabel}
        </Tag>
      </div>
      {status?.accountLabel ? <Text size="small">当前验证账号：{status.accountLabel}</Text> : null}
      {status?.message ? (
        <Text size="small" type={status.verificationStatus === 'invalid' ? 'danger' : 'tertiary'}>
          {status.message}
        </Text>
      ) : null}
      <form className="content-source-settings__form" onSubmit={save}>
        <label className="settings-field">
          <Text size="small" strong>
            {status?.configured ? '替换 Cookie' : 'Cookie'}
          </Text>
          <Input
            autoComplete="off"
            disabled={loading || saving || verifying}
            type="password"
            value={cookie}
            placeholder="SESSDATA=…; bili_jct=…"
            onChange={setCookie}
          />
          <Text size="small" type="tertiary">
            凭据仅写入服务器数据目录，不会回显到页面、浏览器存储或日志。
          </Text>
        </label>
        <div className="content-source-settings__actions">
          {status?.configured ? (
            <Button
              type="danger"
              theme="borderless"
              disabled={saving || verifying}
              onClick={remove}
            >
              删除凭据
            </Button>
          ) : null}
          {status?.configured ? (
            <Button disabled={saving} loading={verifying} onClick={() => void verify()}>
              重新验证
            </Button>
          ) : null}
          <Button
            disabled={!cookie.trim() || verifying}
            htmlType="submit"
            loading={saving}
            theme="solid"
            type="primary"
          >
            保存并验证
          </Button>
        </div>
      </form>
    </section>
  );
}
