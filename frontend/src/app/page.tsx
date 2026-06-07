'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Chat } from '@/components/Chat';
import { Sidebar } from '@/components/Sidebar';
import { VisualizationPanel } from '@/components/VisualizationPanel';
import {
  loadConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  renameConversation,
  type Conversation,
} from '@/lib/conversations';
import type { VisualizationData, ChatMessage } from '@/types';

const WELCOME_MSG: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: `# 👋 欢迎使用 Math Copilot！

我可以帮助你解决数学和几何问题。

**试试以下问题：**
- 计算点 A(1,2) 到点 B(4,6) 的距离
- 绘制函数 y = sin(x) 的图像
- 求两点连线的中点坐标

> 💡 点击右上角齿轮图标可配置 API Key 和模型`,
  isHint: true,
};

export default function Home() {
  const [visualizationData, setVisualizationData] = useState<VisualizationData | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  // Load conversations from localStorage on mount
  useEffect(() => {
    setConversations(loadConversations());
  }, []);

  const activeConv = conversations.find(c => c.id === activeConvId);
  const currentMessages: ChatMessage[] = activeConv?.messages.length
    ? activeConv.messages
    : [WELCOME_MSG];

  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
  }, []);

  const handleSelectConv = useCallback((id: string) => {
    setActiveConvId(id);
  }, []);

  const handleDeleteConv = useCallback((id: string) => {
    deleteConversation(id);
    setConversations(loadConversations());
    if (activeConvId === id) setActiveConvId(null);
  }, [activeConvId]);

  const handleRenameConv = useCallback((id: string, title: string) => {
    renameConversation(id, title);
    setConversations(loadConversations());
  }, []);

  // Called by Chat when messages change
  const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return;

    if (!activeConvId) {
      // Create new conversation on first user message
      const conv = createConversation(msgs[0]);
      updateConversation(conv.id, { messages: msgs });
      setConversations(loadConversations());
      setActiveConvId(conv.id);
    } else {
      updateConversation(activeConvId, { messages: msgs });
      setConversations(loadConversations());
    }
  }, [activeConvId]);

  const handleConversationIdChange = useCallback((conversationId: string) => {
    if (activeConvId) {
      updateConversation(activeConvId, { conversationId });
      setConversations(loadConversations());
    }
  }, [activeConvId]);

  const handleVisualization = useCallback((data: VisualizationData) => {
    setVisualizationData(data);
    setIsPanelOpen(true);
  }, []);

  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  return (
    <main className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white/80 backdrop-blur border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
            title={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              ∫
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 leading-tight">Math Copilot</h1>
              <p className="text-xs text-gray-500">数学大模型约束工程</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className="px-3 py-1.5 text-sm rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors border border-indigo-200"
          >
            {isPanelOpen ? '关闭面板' : '可视化面板'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          conversations={conversations}
          activeId={activeConvId}
          onSelect={handleSelectConv}
          onNew={handleNewChat}
          onDelete={handleDeleteConv}
          onRename={handleRenameConv}
        />

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <Chat
            key={activeConvId ?? 'new'}
            initialMessages={currentMessages}
            conversationId={activeConv?.conversationId}
            onMessagesChange={handleMessagesChange}
            onConversationIdChange={handleConversationIdChange}
            onVisualization={handleVisualization}
          />
        </div>

        {/* Visualization panel */}
        {isPanelOpen && (
          <div
            ref={panelRef}
            className="w-[480px] border-l border-gray-200 bg-white/90 backdrop-blur flex flex-col shrink-0"
          >
            <VisualizationPanel
              data={visualizationData}
              onClose={handleClosePanel}
            />
          </div>
        )}
      </div>
    </main>
  );
}
