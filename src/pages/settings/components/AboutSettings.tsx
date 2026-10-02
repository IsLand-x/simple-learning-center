import { settingsApi } from '../../../api/settings';
import type { SystemInfo } from '../../../api/settings/type';
import { useEffect, useState } from 'react';
import { Button, Typography } from '@douyinfe/semi-ui';
import { appMetadata, formatAppUpdatedAt } from '../../../util/appMetadata';

const { Title, Text } = Typography;
const memorySize = (bytes: number) =>
  `${(bytes / 1024 ** 3).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GiB`;

export function AboutSettings() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void settingsApi
      .getSystemInfo(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setInfo(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : '读取机器信息失败');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requestId]);

  return (
    <section
      className="settings-about [margin-right:auto] [margin-left:auto] [padding:18px_20px] [background:var(--semi-color-bg-1)] mobile:[padding:14px]"
      aria-labelledby="settings-about-title"
    >
      <div className="settings-about__heading justify-between [gap:16px]">
        <div>
          <Title id="settings-about-title" heading={5}>
            软件信息
          </Title>
          <Text size="small" type="tertiary">
            更新于 {formatAppUpdatedAt(appMetadata.updatedAt)}
          </Text>
        </div>
        <code className="settings-about__version inline-flex [min-height:28px] [padding:4px_10px] [background:var(--semi-color-fill-0)] [color:var(--semi-color-text-0)]">
          {appMetadata.version}
        </code>
      </div>
      <section
        className="settings-about__machine min-w-0 [margin-top:20px] [padding-top:16px] [border-top:1px_solid_var(--semi-color-border)] [color:var(--semi-color-text-0)]"
        aria-labelledby="settings-machine-title"
        aria-busy={loading}
      >
        <div className="settings-about__heading justify-between [gap:16px]">
          <Title id="settings-machine-title" heading={5}>
            运行机器
          </Title>
          <Button
            theme="borderless"
            type="tertiary"
            loading={loading}
            disabled={loading}
            onClick={() => setRequestId((value) => value + 1)}
          >
            {error ? '重试' : '刷新'}
          </Button>
        </div>
        <Text size="small" type="tertiary">
          数据服务运行环境可见的信息；容器或虚拟机中的配置可能不同于宿主机。网卡 IP
          不一定是公网访问地址。
        </Text>
        {loading && (
          <Text type="tertiary" role="status">
            正在读取机器信息…
          </Text>
        )}
        {error && (
          <Text type="danger" role="alert">
            {error}
          </Text>
        )}
        {info && (
          <dl className="settings-about__details [margin:0]">
            <div>
              <dt>主机名</dt>
              <dd>{info.hostname || '未知'}</dd>
            </div>
            <div>
              <dt>操作系统</dt>
              <dd>{info.operatingSystem}</dd>
            </div>
            <div>
              <dt>系统架构</dt>
              <dd>{info.architecture}</dd>
            </div>
            <div>
              <dt>CPU</dt>
              <dd>
                {info.cpu.model || '未提供 CPU 型号'} · {info.cpu.logicalCores} 个逻辑核心
              </dd>
            </div>
            <div>
              <dt>内存</dt>
              <dd>
                总计 {memorySize(info.memory.totalBytes)} · 空闲 {memorySize(info.memory.freeBytes)}
              </dd>
            </div>
            <div>
              <dt>Node.js</dt>
              <dd>{info.nodeVersion}</dd>
            </div>
            <div>
              <dt>网卡 IP</dt>
              <dd>
                {info.addresses.length
                  ? info.addresses.map(({ name, address, family }) => (
                      <div
                        className="settings-about__address [align-items:baseline] [gap:4px_12px]"
                        key={`${name}-${family}-${address}`}
                      >
                        <code>{address}</code>
                        <Text size="small" type="tertiary">
                          {name} · {family}
                        </Text>
                      </div>
                    ))
                  : '未检测到非回环地址'}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </section>
  );
}
