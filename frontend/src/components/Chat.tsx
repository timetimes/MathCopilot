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
  initialMessages: ChatMessage[];
  conversationId?: string;
  onMessagesChange: (messages: ChatMessage[]) => void;
  onConversationIdChange: (conversationId: string) => void;
  onVisualization: (data: VisualizationData) => void;
  onToggleSettings?: () => void;
}

export function Chat({ initialMessages, conversationId: initialConvId, onMessagesChange, onConversationIdChange, onVisualization, onToggleSettings }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConvId);

  // ── 多模型 & 输入预处理状态 ─────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [inputStage, setInputStage] = useState<InputStage>('idle');
  const [processedMarkdown, setProcessedMarkdown] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState('');
  const [enableViz, setEnableViz] = useState(true); // 可视化总开关

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userMsgIdRef = useRef<string | null>(null); // 追踪用户消息 ID，用于输入清洗后覆盖
  const isInitialMountRef = useRef(true);
  const backendConfigRef = useRef<{ hasKey: boolean; model: string; baseUrl: string; provider: string } | null>(null);

  // 获取前端模型配置
  const getModelsConfig = useCallback((): ModelConfigMap => {
    return getSettings().modelConfigMap;
  }, []);

  // 初始化时获取后端配置
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() : null)
      .then((cfg: any) => {
        if (!cfg) return;
        backendConfigRef.current = {
          hasKey: cfg.has_openai_key || cfg.has_anthropic_key,
          model: cfg.model_name || '',
          baseUrl: cfg.base_url || '',
          provider: cfg.provider || 'openai',
        };
      })
      .catch(() => {});
  }, []);

  // Sync messages to parent (skip initial mount)
  useEffect(() => {
    if (isInitialMountRef.current) {
      console.log('[Chat] effect: initial mount, skipping sync');
      isInitialMountRef.current = false;
      return;
    }
    console.log('[Chat] effect: syncing messages to parent', { msgCount: messages.length, lastRole: messages[messages.length - 1]?.role });
    onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // ✅ 调试：跟踪组件渲染
  console.log('[Chat] render:', { messages: messages.length, inputStage, loading, input: input?.length, conversationId });

  // 发送消息
  const sendMessage = useCallback(async (showAnswer: boolean = false) => {
    console.log('[Chat] sendMessage called', { showAnswer, input: input?.trim()?.length, loading });
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
        // 求解模式
        console.log('[Chat] sendMessage showAnswer path');
        setInputStage('solving');
        const res = await api.solve({
          message: currentInput,
          conversation_id: conversationId,
          show_answer: true,
          models_config: modelsConfig,
          enable_viz: enableViz,
        }, modelsConfig);

        console.log('[Chat] api.solve returned', { len: res?.reply?.length, conv_id: res?.conversation_id });

        if (!conversationId && res.conversation_id) {
          setConversationId(res.conversation_id);
          onConversationIdChange(res.conversation_id);
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
        console.log('[Chat] setting assistant message', { contentLen: assistantMsg.content?.length });
        setMessages(prev => {
          console.log('[Chat] setMessages (showAnswer) prev.len=', prev.length);
          return [...prev, assistantMsg];
        });

        if (res.visualization_data) {
          onVisualization(res.visualization_data as VisualizationData);
        }
        setInputStage('idle');
        console.log('[Chat] showAnswer path done');
      } else {
        // Hint 模式：先做输入清洗（直接调 LLM，不走后端）
        console.log('[Chat] sendMessage hint path', { hasInputModel: !!modelsConfig?.input, hasDefaultModel: !!modelsConfig?.default });
        setInputStage('processing');

        // 判断是否有可用的清洗模型
        let inputConfig = modelsConfig?.input || modelsConfig?.default || null;
        const hasBackend = backendConfigRef.current?.hasKey;

        if (!inputConfig && !hasBackend) {
          // 完全无配置：跳过清洗，直接求解
          console.log('[Chat] no input model, going direct solve');
          setInputStage('solving');
          try {
            const res = await api.solve({
              message: currentInput,
              conversation_id: conversationId,
              show_answer: true,
              models_config: modelsConfig,
              enable_viz: enableViz,
            }, modelsConfig);

            console.log('[Chat] direct solve returned', { len: res?.reply?.length, conv_id: res?.conversation_id, hasErr: !!res?.suggest_model_upgrade });

            if (!conversationId && res.conversation_id) {
              setConversationId(res.conversation_id);
              onConversationIdChange(res.conversation_id);
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
            console.log('[Chat] setting assistant msg (direct solve)', { contentLen: assistantMsg.content?.length });
            setMessages(prev => {
              console.log('[Chat] setMessages prev.len=', prev.length);
              return [...prev, assistantMsg];
            });

            if (res.visualization_data) {
              onVisualization(res.visualization_data as VisualizationData);
            }
          } catch (err) {
            console.log('[Chat] direct solve error:', err);
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: `❌ 请求失败：${err instanceof Error ? err.message : '网络错误'}`,
              isHint: true,
            }]);
          }
          setInputStage('idle');
          setLoading(false);
          console.log('[Chat] direct solve done, returning');
          return;
        }

        let cleanMarkdown: string;
        if (!inputConfig && hasBackend) {
          // 仅后端有 Key：后端代劳清洗
          const cleanRes = await fetch('/api/clean-input', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: currentInput }),
          });
          const cleanData = await cleanRes.json();
          cleanMarkdown = cleanData.markdown || currentInput;
        } else {
          // 前端有配置：前端直接调 LLM 清洗
          cleanMarkdown = await callLLM(
            INPUT_SYSTEM_PROMPT,
            currentInput,
            inputConfig as ModelConfig,
          );
        }
        setOriginalText(currentInput);
        setProcessedMarkdown(cleanMarkdown);
        setInputStage('editing');
        setLoading(false);
        return; // 等待用户确认后走 solve
      }
    } catch (err) {
      console.log('[Chat] sendMessage outer catch:', err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 请求失败：${err instanceof Error ? err.message : '网络错误'}`,
        isHint: true,
      }]);
      setInputStage('idle');
    } finally {
      console.log('[Chat] sendMessage finally block', { closureInputStage: inputStage, loadingState: loading });
      if (inputStage !== 'editing') {
        setLoading(false);
      }
    }
    console.log('[Chat] sendMessage finished');
  }, [input, loading, conversationId, onVisualization, onConversationIdChange, getModelsConfig, inputStage]);

  // 用户确认输入编辑
  const handleConfirmInput = useCallback(async (editedMarkdown: string) => {
    if (!originalText) return;

    setLoading(true);
    setInputStage('solving');
    const modelsConfig = getModelsConfig();

    // 用清洗后的 Markdown 覆盖原始用户消息
    if (userMsgIdRef.current) {
      if (userMsgIdRef.current) {
        const targetId = userMsgIdRef.current;
        setMessages(prev => prev.map(msg =>
          msg.id === targetId
            ? { ...msg, content: editedMarkdown }
            : msg
        ));
      }
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
        onConversationIdChange(res.conversation_id);
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
      console.log('[Chat] handleConfirmInput error:', err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 解答失败：${err instanceof Error ? err.message : '网络错误'}`,
        isHint: true,
      }]);
    } finally {
      console.log('[Chat] handleConfirmInput finally, setting loading=false');
      setLoading(false);
      setInputStage('confirmed'); // 保留清洗结果框在聊天中
      // 不清除 processedMarkdown/originalText，让结果框持续显示
    }
  }, [originalText, conversationId, getModelsConfig, onVisualization, onConversationIdChange]);

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
        {/* 消息气泡 + InputEditor + 提示分组 */}
        {messages.map((msg, idx) => {
          const isLastUserMsg = msg.role === 'user' && msg.id === userMsgIdRef.current;
          const prevIsUser = idx > 0 && messages[idx - 1].role === 'user';
          const isHintAfterUser = msg.role === 'assistant' && msg.isHint && prevIsUser && !msg.content.startsWith('❌');

          // ── 提示消息：紧凑模式，跟随用户消息 ──
          if (isHintAfterUser) {
            return (
              <div key={msg.id} className="flex justify-start -mt-2 mb-2">
                <div className="ml-8 pl-3 border-l-2 border-gray-200">
                  <div className="text-xs leading-relaxed text-gray-600 bg-gray-100 rounded-lg px-3 py-2 markdown-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id}>
              {/* 消息气泡 */}
              <div className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}>
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
                      {msg.role === 'assistant' && msg.vizCodeAttempts != null && msg.vizCodeAttempts > 0 && !msg.suggestModelUpgrade && (
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

              {/* InputEditor：紧跟在触发清洗的用户消息下方 */}
              {isLastUserMsg && inputStage !== 'idle' && processedMarkdown && (
                <div className="flex justify-end mt-1 mb-2">
                  <div className="max-w-[85%]">
                    <InputEditor
                      originalText={originalText}
                      processedMarkdown={processedMarkdown}
                      stage={inputStage}
                      onConfirm={handleConfirmInput}
                      onCancel={handleCancelInput}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Loading — 在求解过程中显示，清洗阶段由 InputEditor 自己处理 */}
        {loading && (inputStage === 'solving') && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">正在解答...</span>
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
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableViz}
                onChange={e => setEnableViz(e.target.checked)}
                className="w-3 h-3 rounded border-gray-300 text-indigo-500 focus:ring-indigo-400"
              />
              生成可视化图形
            </label>
            <p className="text-[10px] text-gray-400">
              按 Enter 发送 · Shift+Enter 换行
            </p>
          </div>
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
