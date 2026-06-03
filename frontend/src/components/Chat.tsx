'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Send, Lightbulb, ChevronRight, Loader2, Settings, Copy } from 'lucide-react';

// ── 输入清洗提示词 ────────────────────────────────────────────
const INPUT_SYSTEM_PROMPT = `你是一个数学输入预处理助手。你的任务是将用户的原始输入规范化为干净的 Markdown 格式。

规则：
1. 将文字描述的数学问题转换为规范的 Markdown/LaTeX 格式
2. 用 $...$ 表示行内公式，$$...$$ 表示独立公式
3. 修正明显的错别字和不规范符号
4. 保持所有数学信息完整，不要遗漏任何条件
5. 绝对不要回答问题或给出解题思路，只做格式规范化
6. 如果输入已经是规范格式，原样返回

请直接输出规范后的 Markdown 文本。`;
import type { ChatMessage, ChatResponse, VisualizationData, InputStage, ModelConfigMap, ModelConfig } from '@/types';
import { api, getSettings } from '@/lib/api';
import { callLLM } from '@/lib/llm';
import { InputEditor } from './InputEditor';
import { SettingsPanel } from './SettingsPanel';

interface ChatProps {
  onVisualization: (data: VisualizationData) => void;
  onToggleSettings?: () => void;
}

export function Chat({ onVisualization, onToggleSettings }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
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
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();

  // ── 多模型 & 输入预处理状态 ─────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [inputStage, setInputStage] = useState<InputStage>('idle');
  const [processedMarkdown, setProcessedMarkdown] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userMsgIdRef = useRef<string | null>(null); // 追踪用户消息 ID，用于输入清洗后覆盖

  // 获取当前模型配置
  const getModelsConfig = useCallback((): ModelConfigMap => {
    return getSettings().modelConfigMap;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // 发送消息
  const sendMessage = useCallback(async (showAnswer: boolean = false) => {
    if (!input.trim() || loading) return;

    // 如果之前有清洗结果框，发新消息时清除
    if (inputStage === 'confirmed') {
      setProcessedMarkdown(null);
      setOriginalText('');
    }

    const currentInput = input;
    const modelsConfig = getModelsConfig();

    // 添加用户消息
    const uid = Date.now().toString();
    const userMsg: ChatMessage = {
      id: uid,
      role: 'user',
      content: currentInput,
    };
    setMessages(prev => [...prev, userMsg]);
    userMsgIdRef.current = uid; // 保存 ID 以便后续覆盖
    setInput('');
    setLoading(true);

    try {
      if (showAnswer) {
        // 求解模式：直接调 /api/solve
        setInputStage('solving');
        const res = await api.solve({
          message: currentInput,
          conversation_id: conversationId,
          show_answer: true,
          models_config: modelsConfig,
        }, modelsConfig);

        if (!conversationId && res.conversation_id) {
          setConversationId(res.conversation_id);
        }

        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: res.reply,
          isHint: res.is_hint_only,
          visualizationData: res.visualization_data || null,
          vizCodeAttempts: res.viz_code_attempts,
          vizCodeError: res.viz_code_error,
          suggestModelUpgrade: res.suggest_model_upgrade,
        };
        setMessages(prev => [...prev, assistantMsg]);

        if (res.visualization_data) {
          onVisualization(res.visualization_data as VisualizationData);
        }
        setInputStage('idle');
      } else {
        // Hint 模式：先做输入清洗（直接调 LLM，不走后端）
        setInputStage('processing');

        // 解析 Input 角色的模型配置
        let inputConfig = modelsConfig?.input || modelsConfig?.default || null;
        if (!inputConfig) {
          // 未配置：跳过清洗，直接用原文
          setOriginalText(currentInput);
          setProcessedMarkdown(currentInput);
          setInputStage('editing');
          setLoading(false);
          return;
        }
        const cleanMarkdown = await callLLM(
          INPUT_SYSTEM_PROMPT,
          currentInput,
          inputConfig as ModelConfig,
        );
        setOriginalText(currentInput);
        setProcessedMarkdown(cleanMarkdown);
        setInputStage('editing');
        setLoading(false);
        return; // 等待用户确认后走 solve
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 请求失败：${err instanceof Error ? err.message : '网络错误'}`,
        isHint: true,
      }]);
      setInputStage('idle');
    } finally {
      if (inputStage !== 'editing') {
        setLoading(false);
      }
    }
  }, [input, loading, conversationId, onVisualization, getModelsConfig, inputStage]);

  // 用户确认输入编辑
  const handleConfirmInput = useCallback(async (editedMarkdown: string, enableViz: boolean = true) => {
    if (!originalText) return;

    setLoading(true);
    setInputStage('solving');
    const modelsConfig = getModelsConfig();

    // 用清洗后的 Markdown 覆盖原始用户消息
    if (userMsgIdRef.current) {
      setMessages(prev => prev.map(msg =>
        msg.id === userMsgIdRef.current
          ? { ...msg, content: editedMarkdown }
          : msg
      ));
      userMsgIdRef.current = null;
    }

    try {
      const res = await api.solve({
        message: editedMarkdown,
        conversation_id: conversationId,
        show_answer: true,
        models_config: modelsConfig,
        confirmed_markdown: editedMarkdown,
        enable_viz: enableViz,
      }, modelsConfig);

      if (!conversationId && res.conversation_id) {
        setConversationId(res.conversation_id);
      }

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.reply,
        isHint: false,
        visualizationData: res.visualization_data || null,
        vizCodeAttempts: res.viz_code_attempts,
        vizCodeError: res.viz_code_error,
        suggestModelUpgrade: res.suggest_model_upgrade,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (res.visualization_data) {
        onVisualization(res.visualization_data as VisualizationData);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 解答失败：${err instanceof Error ? err.message : '网络错误'}`,
        isHint: true,
      }]);
    } finally {
      setLoading(false);
      setInputStage('confirmed'); // 保留清洗结果框在聊天中
      // 不清除 processedMarkdown/originalText，让结果框持续显示
    }
  }, [originalText, conversationId, getModelsConfig, onVisualization]);

  // 取消输入编辑
  const handleCancelInput = useCallback(() => {
    setInputStage('idle');
    setProcessedMarkdown(null);
    setOriginalText('');
    setLoading(false);
    userMsgIdRef.current = null;
    // 恢复输入框
    setInput(originalText);
  }, [originalText]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(false);
    }
  };

  const lastAssistantMsg = messages.filter(m => m.role === 'assistant').slice(-1)[0];

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* InputEditor（输入预处理阶段） */}
        {inputStage !== 'idle' && processedMarkdown && (
          <div className="max-w-[85%]">
            <InputEditor
              originalText={originalText}
              processedMarkdown={processedMarkdown}
              stage={inputStage}
              onConfirm={handleConfirmInput}
              onCancel={handleCancelInput}
            />
          </div>
        )}

        {/* 消息气泡 */}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
          >
            <div
              className={`relative max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 shadow-sm rounded-bl-sm'
              }`}
            >
              <div className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-gray-800'} markdown-content`}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {msg.content}
                </ReactMarkdown>

                {/* 代码重试信息 (仅 assistant) */}
                {msg.role === 'assistant' && msg.suggestModelUpgrade && (
                  <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                    ⚠️ 当前模型多次尝试仍无法生成有效可视化代码。
                    <br />建议切换到更强的模型（如 GPT-4o / Claude Opus）。
                  </div>
                )}
                {msg.role === 'assistant' && msg.vizCodeAttempts && msg.vizCodeAttempts > 0 && !msg.suggestModelUpgrade && (
                  <div className="mt-1 text-[10px] text-gray-400">
                    可视化代码重试 {msg.vizCodeAttempts} 次后成功
                  </div>
                )}
              </div>

              {/* 查看可视化按钮 (仅 assistant) */}
              {msg.role === 'assistant' && msg.visualizationData && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => onVisualization(msg.visualizationData!)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    <Lightbulb size={14} />
                    查看可视化
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {/* 复制按钮 */}
              <button
                onClick={() => navigator.clipboard.writeText(msg.content)}
                className={`absolute -top-2 -right-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
                title="复制文本"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        ))}

        {/* Loading */}
        {loading && inputStage === 'idle' && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">思考中...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 查看完整解答按钮 */}
      {lastAssistantMsg?.isHint && !loading && inputStage === 'idle' && (
        <div className="px-4 pb-2">
          <button
            onClick={() => sendMessage(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-medium text-sm shadow-md hover:shadow-lg hover:from-indigo-600 hover:to-blue-600 transition-all flex items-center justify-center gap-2"
          >
            <Lightbulb size={18} />
            查看完整解答与可视化
          </button>
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t border-gray-200 bg-white/80 backdrop-blur px-4 py-3">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入数学问题..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all placeholder:text-gray-400"
            disabled={loading || (inputStage !== 'idle' && inputStage !== 'confirmed')}
          />
          <button
            onClick={() => sendMessage(false)}
            disabled={!input.trim() || loading || (inputStage !== 'idle' && inputStage !== 'confirmed')}
            className="shrink-0 w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <p className="text-[10px] text-gray-400">
            按 Enter 发送 · Shift+Enter 换行
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-500 transition-colors"
            title="模型配置"
          >
            <Settings size={12} />
            模型配置
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
