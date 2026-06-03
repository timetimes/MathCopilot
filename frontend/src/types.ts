/**
 * Math Copilot - TypeScript 类型定义
 */

// ── 可视化类型 ─────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
  label?: string;
  color?: string;
}

export interface Segment {
  type: 'segment';
  from: string;
  to: string;
  color?: string;
}

export interface GeometryElement {
  type: 'point' | 'segment' | 'circle' | 'line';
  label?: string;
  x?: number;
  y?: number;
  from?: string;
  to?: string;
  center?: string;
  radius?: number;
  color?: string;
}

export interface GeometryData {
  type: 'geometry';
  elements: GeometryElement[];
  metadata?: Record<string, unknown>;
}

export interface FunctionPlotData {
  type: 'function_plot';
  expression: string;
  points: Point[];
  x_range: [number, number];
}

export type VisualizationData = GeometryData | FunctionPlotData;

// ── 多模型支持 ─────────────────────────────────────────────────

export type ModelProvider = 'openai' | 'anthropic' | 'mock';

export type ModelRole = 'default' | 'input' | 'solution' | 'viz_code' | 'router' | 'formal_proof';

export interface ModelConfig {
  provider: ModelProvider;
  model_name: string;
  api_key: string;
  base_url: string;
}

export type ModelConfigMap = Partial<Record<ModelRole, ModelConfig>>;

export interface AppSettings {
  modelConfigMap: ModelConfigMap;
}

// ── 聊天 ───────────────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  description: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isHint?: boolean;
  visualizationData?: VisualizationData | null;
  /** 多模型相关 */
  vizCodeAttempts?: number;
  vizCodeError?: string | null;
  suggestModelUpgrade?: boolean;
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  show_answer?: boolean;
  models_config?: ModelConfigMap;
  confirmed_markdown?: string;
}

export interface ChatResponse {
  reply: string;
  is_hint_only: boolean;
  conversation_id?: string;
  skill_used?: string | null;
  visualization_data?: VisualizationData | null;
  suggested_skill?: string | null;
  new_skill_generated?: boolean;
  hints?: string[] | null;
  /** 多模型 */
  viz_code_attempts?: number;
  viz_code_error?: string | null;
  suggest_model_upgrade?: boolean;
  input_markdown?: string | null;
}

// ── 交互状态 ───────────────────────────────────────────────────

export type InputStage = 'idle' | 'processing' | 'editing' | 'solving' | 'error';
