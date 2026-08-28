import { useEffect } from 'react';
import {
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconItalic,
  IconList,
  IconOrderedList,
  IconQuote,
  IconRedo,
  IconUndo,
} from '@douyinfe/semi-icons';
import { Button, Tooltip } from '@douyinfe/semi-ui';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface MarkdownNoteEditorProps {
  ariaLabel: string;
  content: string;
  onChange: (markdown: string) => void;
}

const editorExtensions = [
  StarterKit,
  Markdown.configure({
    markedOptions: {
      gfm: true,
      breaks: false,
    },
  }),
  Placeholder.configure({
    placeholder: '使用 Markdown 记录你的想法…',
  }),
];

export function MarkdownNoteEditor({ ariaLabel, content, onChange }: MarkdownNoteEditorProps) {
  const editor = useEditor({
    extensions: editorExtensions,
    content,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'tiptap-markdown-editor__prosemirror',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getMarkdown());
    },
  });

  useEffect(() => {
    if (editor.getMarkdown() === content) return;
    editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false });
  }, [content, editor]);

  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      heading1: currentEditor.isActive('heading', { level: 1 }),
      heading2: currentEditor.isActive('heading', { level: 2 }),
      bulletList: currentEditor.isActive('bulletList'),
      orderedList: currentEditor.isActive('orderedList'),
      blockquote: currentEditor.isActive('blockquote'),
      codeBlock: currentEditor.isActive('codeBlock'),
      canUndo: currentEditor.can().undo(),
      canRedo: currentEditor.can().redo(),
    }),
  });

  return (
    <div className="tiptap-markdown-editor">
      <div
        aria-label="Markdown 格式工具"
        className="tiptap-markdown-editor__toolbar"
        role="toolbar"
        onMouseDown={(event) => event.preventDefault()}
      >
        <Tooltip content="一级标题">
          <Button
            aria-label="切换一级标题"
            aria-pressed={editorState.heading1}
            className={editorState.heading1 ? 'is-active' : undefined}
            icon={<IconH1 />}
            size="small"
            theme="borderless"
            type={editorState.heading1 ? 'primary' : 'tertiary'}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          />
        </Tooltip>
        <Tooltip content="二级标题">
          <Button
            aria-label="切换二级标题"
            aria-pressed={editorState.heading2}
            className={editorState.heading2 ? 'is-active' : undefined}
            icon={<IconH2 />}
            size="small"
            theme="borderless"
            type={editorState.heading2 ? 'primary' : 'tertiary'}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
        </Tooltip>
        <Tooltip content="加粗">
          <Button
            aria-label="切换加粗"
            aria-pressed={editorState.bold}
            className={editorState.bold ? 'is-active' : undefined}
            icon={<IconBold />}
            size="small"
            theme="borderless"
            type={editorState.bold ? 'primary' : 'tertiary'}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
        </Tooltip>
        <Tooltip content="斜体">
          <Button
            aria-label="切换斜体"
            aria-pressed={editorState.italic}
            className={editorState.italic ? 'is-active' : undefined}
            icon={<IconItalic />}
            size="small"
            theme="borderless"
            type={editorState.italic ? 'primary' : 'tertiary'}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
        </Tooltip>
        <span aria-hidden="true" className="tiptap-markdown-editor__divider" />
        <Tooltip content="无序列表">
          <Button
            aria-label="切换无序列表"
            aria-pressed={editorState.bulletList}
            className={editorState.bulletList ? 'is-active' : undefined}
            icon={<IconList />}
            size="small"
            theme="borderless"
            type={editorState.bulletList ? 'primary' : 'tertiary'}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
        </Tooltip>
        <Tooltip content="有序列表">
          <Button
            aria-label="切换有序列表"
            aria-pressed={editorState.orderedList}
            className={editorState.orderedList ? 'is-active' : undefined}
            icon={<IconOrderedList />}
            size="small"
            theme="borderless"
            type={editorState.orderedList ? 'primary' : 'tertiary'}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
        </Tooltip>
        <Tooltip content="引用">
          <Button
            aria-label="切换引用"
            aria-pressed={editorState.blockquote}
            className={editorState.blockquote ? 'is-active' : undefined}
            icon={<IconQuote />}
            size="small"
            theme="borderless"
            type={editorState.blockquote ? 'primary' : 'tertiary'}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
        </Tooltip>
        <Tooltip content="代码块">
          <Button
            aria-label="切换代码块"
            aria-pressed={editorState.codeBlock}
            className={editorState.codeBlock ? 'is-active' : undefined}
            icon={<IconCode />}
            size="small"
            theme="borderless"
            type={editorState.codeBlock ? 'primary' : 'tertiary'}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          />
        </Tooltip>
        <span aria-hidden="true" className="tiptap-markdown-editor__divider" />
        <Tooltip content="撤销">
          <Button
            aria-label="撤销"
            disabled={!editorState.canUndo}
            icon={<IconUndo />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => editor.chain().focus().undo().run()}
          />
        </Tooltip>
        <Tooltip content="重做">
          <Button
            aria-label="重做"
            disabled={!editorState.canRedo}
            icon={<IconRedo />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => editor.chain().focus().redo().run()}
          />
        </Tooltip>
      </div>
      <EditorContent className="tiptap-markdown-editor__content" editor={editor} />
    </div>
  );
}
