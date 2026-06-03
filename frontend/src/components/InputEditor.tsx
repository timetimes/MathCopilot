'use client';

/**
 * InputEditor — 输入预处理结果展示与编辑组件
 *
 * 工作流：
 * 1. 用户输入原始文字 → 后端 Input Model 处理
 * 2. 结果显示在此组件中（规范 Markdown）
 * 3. 用户可自由编辑
 * 4. 确认后传给 /api/solve
 */

import { useState } from 'react';
import { Check, X, Edit3, Loader2 } from 'lucide-react';
import type { InputStage } from '@/types';

interface InputEditorProps {
  /** 原始输入文字 */
  originalText: string;
  /** Input Model 处理后的 Markdown */
  processedMarkdown: string;
  /** 当前阶段 */
  stage: InputStage;
  /** 用户确认编辑后的内容 */
  onConfirm: (editedMarkdown: string) => void;
  /** 取消，回退到原始输入 */
  onCancel: () => void;
}

export function InputEditor({
  originalText,
  processedMarkdown,
  stage,
  onConfirm,
  onCancel,
}: InputEditorProps) {
  const [edited, setEdited] = useState(processedMarkdown);
  const [isEditing, setIsEditing] = useState(false);

  // 当 processedMarkdown 变化时同步
  if (processedMarkdown !== edited && !isEditing && stage === 'editing') {
    // 只在第一次设置时同步
  }

  const handleConfirm = () => {
    onConfirm(isEditing ? edited : processedMarkdown);
  };

  // 处理中
  if (stage === 'processing') {
    return (
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-3">
        <div className="flex items-center gap-2 text-indigo-600">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm font-medium">正在处理输入...</span>
        </div>
        <p className="text-xs text-indigo-400 mt-1 ml-7">
          将非规范文字转换为规范 Markdown 格式
        </p>
      </div>
    );
  }

  // 编辑模式
  if (stage === 'editing') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl mb-3 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-100/50">
          <div className="flex items-center gap-2">
            <Edit3 size={16} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-800">输入已处理 — 请确认/编辑</span>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`text-xs px-2 py-1 rounded-md transition-colors ${
              isEditing
                ? 'bg-amber-200 text-amber-800'
                : 'bg-white/80 text-amber-600 hover:bg-amber-100'
            }`}
          >
            {isEditing ? '预览' : '编辑'}
          </button>
        </div>

        {/* 原文 */}
        <div className="px-4 py-2 bg-white/50 border-b border-amber-100">
          <span className="text-[10px] font-medium text-gray-400 uppercase">原文</span>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{originalText}</p>
        </div>

        {/* 编辑/预览区域 */}
        <div className="px-4 py-3">
          {isEditing ? (
            <textarea
              value={edited}
              onChange={e => setEdited(e.target.value)}
              className="w-full h-28 px-3 py-2 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none resize-y font-mono bg-white"
              autoFocus
            />
          ) : (
            <div className="bg-white rounded-lg p-3 border border-amber-100 text-sm text-gray-700 whitespace-pre-wrap font-mono">
              {edited || processedMarkdown}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 bg-amber-100/30 border-t border-amber-100">
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 rounded-lg hover:bg-white transition-colors"
          >
            <X size={14} />
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
          >
            <Check size={14} />
            确认并解答
          </button>
        </div>
      </div>
    );
  }

  // 求解中
  if (stage === 'solving') {
    return (
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-3">
        <div className="flex items-center gap-2 text-indigo-600">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm font-medium">正在解答...</span>
        </div>
      </div>
    );
  }

  return null;
}
