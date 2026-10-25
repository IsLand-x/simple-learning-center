import { expect, it } from 'vitest';
import { narrationDefaults } from './model';

it('中文配音按选定供应商匹配模型与音色，不把聊天模型当作 TTS', () => {
  expect(narrationDefaults('https://api.siliconflow.cn/v1')).toEqual({
    model: 'FunAudioLLM/CosyVoice2-0.5B',
    voice: 'FunAudioLLM/CosyVoice2-0.5B:alex',
  });
  expect(narrationDefaults('https://api.openai.com/v1')).toEqual({
    model: 'gpt-4o-mini-tts',
    voice: 'marin',
  });
  expect(narrationDefaults('http://127.0.0.1:8000/v1')).toEqual({ model: '', voice: '' });
  expect(narrationDefaults('https://api.siliconflow.cn.example.org/v1')).toEqual({
    model: '',
    voice: '',
  });
});
