'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, MessageSquare, Trash2, Pencil, Check, X } from 'lucide-react';
import type { Conversation } from '@/lib/conversations';

interface SidebarProps {
  isOpen: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function Sidebar({
  isOpen,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const confirmRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditValue('');
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className={`h-full bg-gray-50 border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
        isOpen ? 'w-[260px] opacity-100' : 'w-0 opacity-0'
      }`}
    >
      {/* New Chat */}
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <Plus size={16} />
          新对话
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 && (
          <p className="px-4 py-6 text-xs text-gray-400 text-center">暂无对话记录</p>
        )}
        {conversations.map(conv => {
          const isActive = conv.id === activeId;
          const isEditing = conv.id === editingId;

          return (
            <div
              key={conv.id}
              className={`group relative mx-2 mb-0.5 rounded-lg transition-colors ${
                isActive ? 'bg-gray-200' : 'hover:bg-gray-100'
              }`}
            >
              {isEditing ? (
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') cancelRename();
                    }}
                    className="flex-1 bg-white text-sm px-2 py-1 rounded border border-gray-300 outline-none focus:border-indigo-400"
                  />
                  <button onClick={confirmRename} className="p-1 hover:text-green-600">
                    <Check size={14} />
                  </button>
                  <button onClick={cancelRename} className="p-1 hover:text-red-500">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onSelect(conv.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm rounded-lg"
                >
                  <MessageSquare size={15} className="shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-gray-700">{conv.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(conv.updatedAt)}</p>
                  </div>
                </button>
              )}

              {/* Hover actions */}
              {!isEditing && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-white rounded-md px-1 py-0.5 shadow-sm border border-gray-200">
                  <button
                    onClick={e => { e.stopPropagation(); startRename(conv); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="重命名"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200">
        <p className="text-[10px] text-gray-400 text-center">Math Copilot</p>
      </div>
    </div>
  );
}
