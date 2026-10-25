export function videoTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function narrationDefaults(baseUrl: string) {
  try {
    if (['api.siliconflow.cn', 'api.siliconflow.com'].includes(new URL(baseUrl).hostname))
      return { model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'FunAudioLLM/CosyVoice2-0.5B:alex' };
    if (new URL(baseUrl).hostname === 'api.openai.com')
      return { model: 'gpt-4o-mini-tts', voice: 'marin' };
  } catch {
    /* Incomplete custom endpoints can still be edited in settings. */
  }
  return { model: '', voice: '' };
}
