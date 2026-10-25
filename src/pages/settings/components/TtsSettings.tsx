import { Button, Input, Select, Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { useEffect, useState } from 'react';
import type { TtsStatus } from '../../../../contracts/ai';
import { settingsApi } from '../../../api/settings';
import { confirmDialog } from '../../../util/confirmDialog';

export function TtsSettings() {
  const [config, setConfig] = useState<TtsStatus>();
  const [apiKey, setApiKey] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [audio, setAudio] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void settingsApi
      .getTts(controller.signal)
      .then(setConfig)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '读取语音配置失败');
      });
    return () => controller.abort();
  }, []);
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  const save = async () => {
    if (!config || pending) return;
    setPending(true);
    setError('');
    try {
      setConfig(
        await settingsApi.saveTts({
          provider: 'aliyun',
          region: config.region,
          model: config.model,
          voice: config.voice,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      );
      setApiKey('');
      Toast.success('TTS 配置已保存');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存语音配置失败');
    } finally {
      setPending(false);
    }
  };
  const test = async () => {
    setPending(true);
    setError('');
    try {
      setAudio(URL.createObjectURL(await settingsApi.testTts(AbortSignal.timeout(120_000))));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '试听失败');
    } finally {
      setPending(false);
    }
  };
  if (!config && !error) return <Spin tip="正在读取语音配置" />;
  return (
    <section
      className="flex min-w-0 flex-col gap-5 rounded-[var(--semi-border-radius-medium)] border border-solid [border-color:var(--semi-color-border)] [background:var(--semi-color-bg-1)] p-4"
      aria-label="TTS 语音配置"
    >
      <div>
        <Typography.Title heading={5}>TTS 语音合成</Typography.Title>
        <Typography.Text type="tertiary">
          用于章节视频中文配音，与讲稿使用的 AI 模型分别配置。
        </Typography.Text>
      </div>
      {error && (
        <p role="alert" className="text-[14px] [color:var(--semi-color-danger)]">
          {error}
        </p>
      )}
      {config && (
        <>
          <label className="flex flex-col gap-2 text-[14px]">
            供应商
            <Input value="阿里云百炼 · Qwen TTS" disabled />
          </label>
          <label className="flex flex-col gap-2 text-[14px]">
            <span id="tts-region-label">地域</span>
            <Select
              aria-labelledby="tts-region-label"
              value={config.region}
              disabled={pending}
              optionList={[
                { value: 'cn-beijing', label: '华北 2（北京）' },
                { value: 'ap-southeast-1', label: '新加坡' },
              ]}
              onChange={(value) => {
                if (value === 'cn-beijing' || value === 'ap-southeast-1')
                  setConfig({ ...config, region: value });
              }}
            />
          </label>
          <label className="flex flex-col gap-2 text-[14px]">
            API Key
            <Input
              mode="password"
              autoComplete="new-password"
              aria-label="TTS API Key"
              value={apiKey}
              disabled={pending}
              placeholder={
                config.configured ? '已保存，留空保留现有密钥' : '填写所选地域的百炼 API Key'
              }
              onChange={setApiKey}
              className="mobile:[&_.semi-input]:text-[16px]"
            />
          </label>
          <div className="grid min-w-0 grid-cols-2 gap-4 mobile:grid-cols-1">
            <label className="flex min-w-0 flex-col gap-2 text-[14px]">
              <span id="tts-model-label">语音模型</span>
              <Select
                aria-labelledby="tts-model-label"
                value={config.model}
                disabled={pending}
                optionList={[
                  { value: 'qwen3-tts-flash', label: 'Qwen3 TTS Flash' },
                  { value: 'qwen3-tts-flash-2025-11-27', label: 'Qwen3 TTS Flash · 2025-11-27' },
                ]}
                onChange={(value) => {
                  if (typeof value === 'string') setConfig({ ...config, model: value });
                }}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2 text-[14px]">
              <span id="tts-voice-label">音色</span>
              <Select
                aria-labelledby="tts-voice-label"
                value={config.voice}
                disabled={pending}
                optionList={[
                  { value: 'Cherry', label: '芊悦 · 自然女声' },
                  { value: 'Serena', label: '苏瑶 · 温柔女声' },
                  { value: 'Ethan', label: '晨煦 · 稳重男声' },
                  { value: 'Chelsie', label: '千雪 · 活力女声' },
                ]}
                onChange={(value) => {
                  if (typeof value === 'string') setConfig({ ...config, voice: value });
                }}
              />
            </label>
          </div>
          <p className="text-[12px] leading-normal [color:var(--semi-color-text-2)]">
            密钥仅保存在服务器私有数据目录，读取配置时不返回密钥。试听会发送一段固定测试文字，视频配音仅在勾选后将讲稿发送给百炼。北京与新加坡的密钥不能混用。
          </p>
          <div className="flex flex-wrap items-center gap-3 mobile:[&_.semi-button]:relative mobile:[&_.semi-button]:after:absolute mobile:[&_.semi-button]:after:inset-x-0 mobile:[&_.semi-button]:after:-inset-y-1.5 mobile:[&_.semi-button]:after:content-['']">
            <Button theme="solid" disabled={pending} loading={pending} onClick={() => void save()}>
              保存 TTS 配置
            </Button>
            <Button disabled={pending || !config.configured} onClick={() => void test()}>
              试听已保存配置
            </Button>
            <Button
              theme="borderless"
              type="danger"
              disabled={pending || !config.configured}
              onClick={() =>
                confirmDialog({
                  title: '删除 TTS 配置？',
                  content: '只删除服务器数据目录中的语音配置与密钥，已生成的视频不受影响。',
                  onOk: async () => {
                    setConfig(await settingsApi.removeTts());
                    setApiKey('');
                    setAudio('');
                  },
                })
              }
            >
              删除配置
            </Button>
          </div>
          {audio && <audio controls src={audio} aria-label="TTS 试听音频" className="max-w-full" />}
        </>
      )}
    </section>
  );
}
