import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

test(
  '中文配音使用明确选择的端点和参数，拒绝重定向及上游错误并生成真实 AAC 音轨',
  { skip: !hasFfmpeg, timeout: 600_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'chapter-video-audio-'));
    process.env.LEARNING_CENTER_DATA_DIR = directory;
    const { runMediaCommand, synthesizeNarration } = await import('./media.js');
    const { prepareSceneAudio } = await import('./audio.js');
    const { initializeDataDirectories, chapterVideoPath, chapterVideoDirectoryPath } =
      await import('../../../infrastructure/fs/files.js');
    const { writePersistedState } = await import('../../state/stateStore.js');
    const { renderChapterVideo } = await import('./render.js');
    await initializeDataDirectories();
    const signal = new AbortController().signal;
    await runMediaCommand(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-q:a',
        '8',
        '-y',
        'fixture.mp3',
      ],
      directory,
      signal,
    );
    const audio = await readFile(join(directory, 'fixture.mp3'));
    const calls = [];
    let mode = 'audio';
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      calls.push({
        path: request.url,
        authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      });
      if (mode === 'redirect') {
        response.writeHead(302, { Location: '/do-not-follow' });
        response.end();
      } else if (mode === 'error') {
        response.writeHead(401);
        response.end('private-fixture-key must never be shown');
      } else if (mode === 'oversize') {
        response.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': 20 * 1024 * 1024,
        });
        response.end();
      } else {
        response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        response.end(audio);
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const narration = {
      config: {
        id: 'chosen',
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        apiKey: 'private-fixture-key',
      },
      model: 'chosen-tts',
      voice: 'chosen-voice',
    };
    try {
      assert.deepEqual(await synthesizeNarration(narration, '中文讲解', signal), audio);
      assert.equal(calls[0].path, '/v1/audio/speech');
      assert.deepEqual(calls[0].body, {
        model: 'chosen-tts',
        voice: 'chosen-voice',
        input: '中文讲解',
        response_format: 'mp3',
      });
      assert.equal(calls[0].authorization, 'Bearer private-fixture-key');
      mode = 'redirect';
      const before = calls.length;
      await assert.rejects(synthesizeNarration(narration, '讲稿', signal), /302/);
      assert.equal(calls.length, before + 1);
      mode = 'error';
      await assert.rejects(
        synthesizeNarration(narration, '讲稿', signal),
        (error) => !error.message.includes('private-fixture-key') && /401/.test(error.message),
      );
      mode = 'oversize';
      await assert.rejects(synthesizeNarration(narration, '讲稿', signal), /MP3/);
      mode = 'audio';
      await writePersistedState({
        version: 42,
        state: { books: [{ id: 'book', title: '测试书籍' }] },
      });
      const scene = {
        title: '概念讲解',
        narration: '这是供测试使用的中文讲稿，帮助验证配音与字幕时间线。',
        layout: 'steps',
        points: [
          { title: '先提问题', detail: '明确学习目标' },
          { title: '再看证据', detail: '用原文验证理解' },
        ],
        sources: [],
        startSeconds: 0,
        durationSeconds: 0,
      };
      const segmented = {
        ...scene,
        beats: ['先核对原文中的结论。', '再核对这个结论的适用条件。'].map((text, index) => ({
          text,
          focus: 'point',
          pointIndex: index,
          startSeconds: 0,
          durationSeconds: 0,
        })),
      };
      segmented.narration = segmented.beats.map((beat) => beat.text).join('');
      const prepared = await prepareSceneAudio(segmented, narration, directory, 999, signal);
      const joinedDuration = Number(
        await runMediaCommand(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            prepared.audioName,
          ],
          directory,
          signal,
        ),
      );
      assert.equal(prepared.audioFormat, 'wav');
      assert.equal(segmented.beats[0].startSeconds, 0);
      assert.equal(segmented.beats[1].startSeconds, segmented.beats[0].durationSeconds);
      assert.ok(
        Math.abs(
          joinedDuration - segmented.beats.reduce((sum, beat) => sum + beat.durationSeconds, 0),
        ) < 0.001,
        '段落时间必须与解码、合并后的实际音轨相同',
      );
      const input = {
        id: 'b4a45c29-493b-47d7-b75a-d19c0b311cb4',
        bookId: 'book',
        chapterTitle: '全书导读',
        title: '测试讲解',
        summary: '测试音轨',
        version: 1,
        model: 'fixture',
        hasAudio: true,
        generatedAt: 1,
        durationSeconds: 0,
        scenes: [segmented, scene, scene],
      };
      const rendered = await renderChapterVideo(input, '测试书籍', narration, signal, () => {});
      const path = chapterVideoPath('book', input.id, 'mp4');
      const metadata = JSON.parse(
        await runMediaCommand(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'stream=codec_name,codec_type,width,height:format=duration',
            '-of',
            'json',
            path,
          ],
          directory,
          signal,
        ),
      );
      assert.equal(
        metadata.streams.find((stream) => stream.codec_type === 'audio').codec_name,
        'aac',
      );
      const video = metadata.streams.find((stream) => stream.codec_type === 'video');
      assert.equal(video.width, 1280);
      assert.equal(video.height, 720);
      assert.ok(Math.abs(Number(metadata.format.duration) - rendered.durationSeconds) < 0.25);
      const silent = await renderChapterVideo(
        { ...input, id: 'a4a45c29-493b-47d7-b75a-d19c0b311cb4', hasAudio: false },
        '测试书籍',
        undefined,
        signal,
        () => {},
      );
      const silentDuration = Number(
        await runMediaCommand(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            chapterVideoPath('book', silent.id, 'mp4'),
          ],
          directory,
          signal,
        ),
      );
      assert.ok(
        Math.abs(silentDuration - silent.durationSeconds) < 0.1,
        '字幕版实际时长必须覆盖完整分镜时间线',
      );
      const controller = new AbortController();
      await assert.rejects(
        renderChapterVideo(
          { ...input, id: 'c4a45c29-493b-47d7-b75a-d19c0b311cb4' },
          '测试书籍',
          undefined,
          controller.signal,
          (stage) => {
            if (stage.startsWith('正在渲染视频')) controller.abort();
          },
        ),
        { name: 'AbortError' },
      );
      assert.ok(
        (await readdir(chapterVideoDirectoryPath('book'))).every(
          (name) => !name.startsWith('.render-'),
        ),
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
