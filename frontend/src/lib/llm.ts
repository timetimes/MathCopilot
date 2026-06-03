/**
 * LLM 直接调用工具
 *
 * 不经过后端，直接从浏览器调用用户配置的 LLM API。
 * 用于：输入预处理、模型列表获取等纯 LLM 操作。
 */

import type { ModelConfig } from '@/types';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 直接调用 LLM API
 * @param systemPrompt 系统提示词
 * @param userMessage 用户消息
 * @param config 模型配置（Provider / Model / Key / URL）
 * @returns LLM 返回的文本
 */
export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  config: ModelConfig,
): Promise<string> {
  const baseUrl = config.base_url.replace(/\/+$/, '');
  const apiKey = config.api_key;

  if (!apiKey) {
    throw new Error('API Key 未配置');
  }

  if (config.provider === 'anthropic') {
    return callAnthropic(baseUrl, apiKey, config.model_name, systemPrompt, userMessage);
  }

  // 默认 OpenAI 格式（也兼容所有 OpenAI 兼容 API）
  return callOpenAI(baseUrl, apiKey, config.model_name, systemPrompt, userMessage);
}

/**
 * 获取可用模型列表（直接调用用户配置的 URL）
 */
export async function fetchModelsFromProvider(
  config: ModelConfig,
): Promise<{ id: string; name: string }[]> {
  const baseUrl = config.base_url.replace(/\/+$/, '');
  const apiKey = config.api_key;

  if (!apiKey) throw new Error('API Key 未配置');
  if (config.provider === 'mock') return [];
  if (config.provider === 'anthropic') return getAnthropicModels();

  const url = `${baseUrl}/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}${res.statusText ? ': ' + res.statusText : ''}`);
  }

  const data = await res.json();
  const models: any[] = data?.data || [];
  return models
    .map(m => ({ id: m.id, name: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ── OpenAI 格式 ────────────────────────────────────────────────

async function callOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI API 错误 (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

// ── Anthropic 格式 ─────────────────────────────────────────────

async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const url = `${baseUrl}/v1/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API 错误 (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.content?.[0]?.text?.trim() || '';
}

// ── Anthropic 内置模型列表 ─────────────────────────────────────

export function getAnthropicModels(): { id: string; name: string }[] {
  return [
    'claude-opus-4-20250514', 'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229', 'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ].map(id => ({ id, name: id }));
}
