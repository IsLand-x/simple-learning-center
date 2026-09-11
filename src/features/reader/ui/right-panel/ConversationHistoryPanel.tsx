import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, Empty, Toast } from '@douyinfe/semi-ui';
import { IconAlertTriangle, IconDeleteStroked } from '@douyinfe/semi-icons';
import { confirmDialog } from '../../../../lib/confirmDialog';
import { formatRelativeTime } from '../../../../lib/format';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { ChatSession } from '../../../../types';
import { providerLabel } from '../../model/rightPanelModel';

export function ConversationHistoryPanel({
  bookId,
  activeConversationId,
  onResumeConversation,
}: {
  bookId: string;
  activeConversationId: string;
  onResumeConversation: (session: ChatSession) => void;
}) {
  const allChats = useLearningStore((state) => state.chats);
  const allSessions = useLearningStore((state) => state.chatSessions);
  const configs = useLearningStore((state) => state.openAIConfigs);
  const deleteChatSession = useLearningStore((state) => state.deleteChatSession);
  const [contextMenu, setContextMenu] = useState<{
    session: ChatSession;
    x: number;
    y: number;
  } | null>(null);
  const sessions = useMemo(
    () =>
      allSessions
        .filter((session) => session.bookId === bookId)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [allSessions, bookId],
  );

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  const confirmDelete = (session: ChatSession) => {
    confirmDialog({
      title: `删除“${session.title}”？`,
      content: '这条对话及其中的消息只会从服务器数据目录删除，且无法恢复。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-danger)' }} />,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => {
        deleteChatSession(session.id);
        Toast.success('对话已删除');
      },
    });
  };

  return (
    <div className="right-panel__body history-panel">
      {sessions.length ? (
        sessions.map((session) => {
          const messageCount = allChats.filter(
            (message) => message.conversationId === session.id,
          ).length;
          const modelLabel = session.model || providerLabel(session.provider, configs);
          const metaLabel = `${formatRelativeTime(session.updatedAt)} · ${modelLabel} · ${messageCount} 条消息`;
          return (
            <button
              key={session.id}
              type="button"
              title="右键可删除这条对话"
              className={`ai-history-item${session.id === activeConversationId ? ' ai-history-item--active' : ''}`}
              onClick={() => onResumeConversation(session)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({ session, x: event.clientX, y: event.clientY });
              }}
            >
              <span className="ai-history-item__title">
                <strong>{session.title}</strong>
              </span>
              <span className="ai-history-item__meta" title={metaLabel}>
                {metaLabel}
              </span>
            </button>
          );
        })
      ) : (
        <Empty title="暂无历史对话" description="发送第一条消息后会自动保存到服务器" />
      )}
      {contextMenu &&
        createPortal(
          <Dropdown
            autoAdjustOverflow
            closeOnEsc
            margin={0}
            motion={false}
            position="bottomLeft"
            rePosKey={`${contextMenu.x}:${contextMenu.y}`}
            spacing={0}
            trigger="custom"
            visible
            render={
              <Dropdown.Menu>
                <Dropdown.Item
                  type="danger"
                  icon={<IconDeleteStroked />}
                  onClick={() => {
                    const { session } = contextMenu;
                    setContextMenu(null);
                    confirmDelete(session);
                  }}
                >
                  删除对话
                </Dropdown.Item>
              </Dropdown.Menu>
            }
            onVisibleChange={(visible) => {
              if (!visible) setContextMenu(null);
            }}
          >
            <span
              aria-hidden="true"
              className="cursor-context-menu-anchor"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              tabIndex={-1}
            />
          </Dropdown>,
          document.body,
        )}
    </div>
  );
}
