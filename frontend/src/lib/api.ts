/**
 * Math Copilot - API 服务层
 * 封装所有后端 API 调用，支持多模型配置（X-Model-Config header）
 */

import type {
  ChatRequest, ChatResponse, SkillInfo,
  ModelConfigMap, AppSettings,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SETTINGS_KEY = 'mathcopilot_settings';

// ── 本地存储 ───────────────────────────────────────────────────

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { modelConfigMap: {} };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}

// ── Model Config 序列化 ────────────────────────────────────────

export function serializeModelConfigMap(configMap: ModelConfigMap): string {
  try {
    const json = JSON.stringify(configMap);
    return btoa(unescape(encodeURIComponent(json)));
  } catch {
    return '';
  }
}

export function getModelConfigHeaders(configMap: ModelConfigMap): Record<string, string> {
  const encoded = serializeModelConfigMap(configMap);
  if (!encoded) return {};
  return { 'X-Model-Config': encoded };
}

// ── HTTP 客户端 ────────────────────────────────────────────────

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  configMap?: ModelConfigMap,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // 附加模型配置 header
  if (configMap) {
    Object.assign(headers, getModelConfigHeaders(configMap));
  }

  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '未知错误');
    throw new ApiError(`API 错误 (${res.status}): ${text}`, res.status);
  }

  return res.json();
}

// ── API 方法 ───────────────────────────────────────────────────

export const api = {
  /** 健康检查 */
  health: (): Promise<{ status: string; skills_loaded: number }> =>
    request('/api/health'),

  /** 获取所有 Skill */
  getSkills: (): Promise<{ skills: SkillInfo[] }> =>
    request('/api/skills'),

  /** 发送聊天消息 */
  chat: (data: ChatRequest, configMap?: ModelConfigMap): Promise<ChatResponse> =>
    request('/api/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }, configMap),

  /** 直接求解（跳过 hint 阶段） */
  solve: (data: ChatRequest, configMap?: ModelConfigMap): Promise<ChatResponse> =>
    request('/api/solve', {
      method: 'POST',
      body: JSON.stringify(data),
    }, configMap),

  /** 生成新 Skill */
  generateSkill: (data: {
    name: string; description: string; code: string;
  }): Promise<{ message: string; file_path: string }> =>
    request('/api/generate-skill', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 可视化交互 */
  interact: (data: {
    visualization_type: string;
    params: Record<string, unknown>;
  }): Promise<{ visualization_data: Record<string, unknown> }> =>
    request('/api/interact', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** 沙箱执行代码 */
  execute: (data: {
    code: string;
    input_data?: Record<string, unknown>;
  }): Promise<{ success: boolean; stdout: string; result?: unknown; error?: string | null }> =>
    request('/api/execute', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export { ApiError };
