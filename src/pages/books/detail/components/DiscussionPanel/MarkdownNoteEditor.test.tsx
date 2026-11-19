import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { expect, it, vi } from 'vitest';
import { MarkdownNoteEditor } from './MarkdownNoteEditor';

vi.mock('@douyinfe/semi-ui', () => ({
  Button: ({ children }: { children?: import('react').ReactNode }) =>
    createElement('button', null, children),
  Tooltip: ({ children }: { children?: import('react').ReactNode }) => children,
}));

let currentEditor: Editor;
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      const editor = actual.useEditor(...args);
      if (editor) currentEditor = editor;
      return editor;
    },
  };
});

it('serializes once per edit and keeps the document and undo history on save echoes', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let replaceContent: (content: string) => void = () => {};
  const changes = vi.fn();
  function Probe() {
    const [content, setContent] = useState('原文');
    replaceContent = setContent;
    return createElement(MarkdownNoteEditor, {
      ariaLabel: '测试笔记',
      content,
      onChange: (markdown) => {
        changes(markdown);
        setContent(markdown);
      },
    });
  }
  try {
    await act(async () => root.render(createElement(Probe)));
    const serialize = vi.spyOn(currentEditor, 'getMarkdown');
    const originalDoc = currentEditor.state.doc;
    await act(async () => currentEditor.commands.insertContent('继续'));
    expect(changes).toHaveBeenCalledOnce();
    expect(serialize).toHaveBeenCalledOnce();
    const editedDoc = currentEditor.state.doc;
    expect(editedDoc).not.toBe(originalDoc);
    await act(async () => replaceContent(changes.mock.calls[0][0]));
    expect(currentEditor.state.doc).toBe(editedDoc);
    expect(serialize).toHaveBeenCalledOnce();
    expect(currentEditor.can().undo()).toBe(true);
    await act(async () => replaceContent('外部更新\n\nAI 新增见解'));
    expect(currentEditor.getText()).toContain('AI 新增见解');
    expect(changes).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
