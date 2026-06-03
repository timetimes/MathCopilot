'use client';

/**
 * SettingsPanel — 多角色模型配置抽屉
 *
 * 功能：
 * - 全局 API Key / Base URL 配置
 * - 每个角色独立选 Provider + Model + Key + URL
 * - 从 URL+Key **直接**获取可用模型列表（不走本地后端）
 * - 存 localStorage
 */

import { useState, useEffect } from 'react';
import { X, Save, RotateCcw, RefreshCw, Loader2 } from 'lucide-react';
import type { ModelConfig, ModelConfigMap, ModelRole, AppSettings } from '@/types';
import { getSettings, saveSettings } from '@/lib/api';
import { fetchModelsFromProvider } from '@/lib/llm';

const ROLES: { key: ModelRole; label: string; description: string }[] = [
  { key: 'default',      label: '默认 (Default)',        description: '所有角色的回退模型' },
  { key: 'input',        label: '输入清洗 (Input)',      description: '将非规范文字转为规范 Markdown' },
  { key: 'solution',     label: '解题推理 (Solution)',   description: '生成解题思路和答案' },
  { key: 'viz_code',     label: '代码生成 (Viz Code)',   description: '生成可视化 Python 代码' },
  { key: 'router',       label: 'Skill 路由 (Router)',   description: '选择最合适的 Skill（轻量模型推荐）' },
  { key: 'formal_proof', label: '形式化证明 (Formal Proof)', description: '生成 Lean/Coq 等形式化证明（预留功能）' },
];

const DEFAULT_CONFIG: ModelConfig = {
  provider: 'openai',
  model_name: 'gpt-4-turbo-preview',
  api_key: '',
  base_url: 'https://api.openai.com/v1',
};

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>({ modelConfigMap: {} });
  const [globalKey, setGlobalKey] = useState('');
  const [globalUrl, setGlobalUrl] = useState('https://api.openai.com/v1');
  const [dirty, setDirty] = useState(false);

  // 模型获取状态（每个角色独立）
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [modelLists, setModelLists] = useState<Record<string, { id: string; name: string }[]>>({});
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});

  // 加载配置
  useEffect(() => {
    if (isOpen) {
      const s = getSettings();
      setSettings(s);
      const def = s.modelConfigMap.default;
      setGlobalKey(def?.api_key || '');
      setGlobalUrl(def?.base_url || 'https://api.openai.com/v1');
      setDirty(false);
    }
  }, [isOpen]);

  const getRoleConfig = (role: ModelRole): ModelConfig => {
    return settings.modelConfigMap[role] || { ...DEFAULT_CONFIG };
  };

  const updateRoleConfig = (role: ModelRole, field: keyof ModelConfig, value: string) => {
    setSettings(prev => {
      const configMap = { ...prev.modelConfigMap };
      const current = { ...(configMap[role] || { ...DEFAULT_CONFIG }) };
      (current as any)[field] = value;
      configMap[role] = current;
      return { modelConfigMap: configMap };
    });
    setDirty(true);
  };

  const useGlobalConfig = (role: ModelRole) => {
    updateRoleConfig(role, 'api_key', globalKey);
    updateRoleConfig(role, 'base_url', globalUrl);
  };

    // ── 直接从用户配置的 URL 获取模型列表 ──────────────────────
  const fetchModels = async (role: ModelRole) => {
    const cfg = getRoleConfig(role);
    const key = cfg.api_key || globalKey;
    const baseUrl = cfg.base_url || globalUrl;
    const provider = cfg.provider;

    if (provider === 'mock') {
      setFetchErrors(prev => ({ ...prev, [role]: 'Mock 模式无可用模型' }));
      return;
    }
    if (!key) {
      setFetchErrors(prev => ({ ...prev, [role]: '请先输入 API Key' }));
      return;
    }

    setFetchingModels(prev => ({ ...prev, [role]: true }));
    setFetchErrors(prev => ({ ...prev, [role]: '' }));

    try {
      const models = await fetchModelsFromProvider({
        provider: provider as any,
        model_name: cfg.model_name,
        api_key: key,
        base_url: baseUrl,
      });

      setModelLists(prev => ({ ...prev, [role]: models }));

      if (!models.find(m => m.id === cfg.model_name)) {
        updateRoleConfig(role, 'model_name', models[0]?.id || cfg.model_name);
      }
    } catch (err) {
      setFetchErrors(prev => ({
        ...prev,
        [role]: err instanceof Error ? err.message : '请求失败',
      }));
    } finally {
      setFetchingModels(prev => ({ ...prev, [role]: false }));
    }
  };

  const handleSave = () => {
    // 保存时：如果 Default 角色为空但全局配置有值，自动填充
    const configMap = { ...settings.modelConfigMap };
    const def = configMap.default || { ...DEFAULT_CONFIG };
    if ((!def.api_key || def.api_key === DEFAULT_CONFIG.api_key) && globalKey) {
      def.api_key = globalKey;
    }
    if (def.base_url === DEFAULT_CONFIG.base_url && globalUrl) {
      def.base_url = globalUrl;
    }
    configMap.default = def;

    const toSave: AppSettings = { modelConfigMap: configMap };
    saveSettings(toSave);
    setSettings(toSave);
    setDirty(false);
    onClose();
  };

  const handleReset = () => {
    const empty: AppSettings = { modelConfigMap: {} };
    setSettings(empty);
    setGlobalKey('');
    saveSettings(empty);
    setDirty(false);
    setModelLists({});
    setFetchErrors({});
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      <div className="relative w-[560px] max-w-[90vw] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">模型配置</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              支持 OpenAI / Anthropic / 第三方兼容 API
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 全局配置 */}
          <section className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <h3 className="text-sm font-semibold text-indigo-800 mb-3">全局配置</h3>
            <p className="text-[11px] text-indigo-500 mb-3">
              填入后每个角色可"使用全局"一键继承
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
                <input
                  type="password"
                  value={globalKey}
                  onChange={e => { setGlobalKey(e.target.value); setDirty(true); }}
                  placeholder="sk-... 或任意 API Key"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Base URL</label>
                <input
                  type="text"
                  value={globalUrl}
                  onChange={e => { setGlobalUrl(e.target.value); setDirty(true); }}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
                />
              </div>
            </div>
          </section>

          {/* 角色配置 */}
          {ROLES.map(role => {
            const config = getRoleConfig(role.key);
            const models = modelLists[role.key];
            const fetching = fetchingModels[role.key];
            const error = fetchErrors[role.key];

            return (
              <section key={role.key} className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">{role.label}</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">{role.description}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    config.api_key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {config.api_key ? '已配置' : '未配置'}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {/* Provider */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Provider</label>
                      <select
                        value={config.provider}
                        onChange={e => {
                          updateRoleConfig(role.key, 'provider', e.target.value);
                          // 切换 provider 时自动切换默认 URL
                          const urls: Record<string, string> = {
                            openai: 'https://api.openai.com/v1',
                            anthropic: 'https://api.anthropic.com',
                            mock: '',
                          };
                          const newUrl = urls[e.target.value] || '';
                          if (newUrl) updateRoleConfig(role.key, 'base_url', newUrl);
                          // 清空该角色的模型缓存
                          setModelLists(prev => { const r = { ...prev }; delete r[role.key]; return r; });
                        }}
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="mock">Mock (离线)</option>
                      </select>
                    </div>

                    {/* Model */}
                    <div className="flex-[2]">
                      <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                        模型名称
                        {models && (
                          <button
                            onClick={() => fetchModels(role.key)}
                            className="ml-1.5 text-indigo-400 hover:text-indigo-600 align-middle"
                            title="刷新模型列表"
                          >
                            <RefreshCw size={10} />
                          </button>
                        )}
                      </label>
                      {models && models.length > 0 ? (
                        <select
                          value={config.model_name}
                          onChange={e => updateRoleConfig(role.key, 'model_name', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
                        >
                          {models.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={config.model_name}
                          onChange={e => updateRoleConfig(role.key, 'model_name', e.target.value)}
                          placeholder="gpt-4o / claude-sonnet-4-20250514"
                          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
                        />
                      )}
                    </div>
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                      Base URL <span className="text-gray-400">（留空使用全局）</span>
                    </label>
                    <input
                      type="text"
                      value={config.base_url}
                      onChange={e => updateRoleConfig(role.key, 'base_url', e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      OpenAI 兼容: https://xxx/v1 · Anthropic: https://api.anthropic.com
                    </p>
                  </div>

                  {/* API Key */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                        API Key <span className="text-gray-400">（留空使用全局）</span>
                      </label>
                      <input
                        type="password"
                        value={config.api_key}
                        onChange={e => updateRoleConfig(role.key, 'api_key', e.target.value)}
                        placeholder="sk-... 或留空"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none"
                      />
                    </div>
                    <button
                      onClick={() => useGlobalConfig(role.key)}
                      className="px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 whitespace-nowrap"
                    >
                      使用全局
                    </button>
                    <button
                      onClick={() => fetchModels(role.key)}
                      disabled={fetching}
                      className="px-2.5 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg whitespace-nowrap flex items-center gap-1 disabled:opacity-50"
                    >
                      {fetching ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      获取模型
                    </button>
                  </div>

                  {fetching && (
                    <div className="flex items-center gap-1.5 text-xs text-indigo-500">
                      <Loader2 size={12} className="animate-spin" />
                      正在从 {config.base_url}/models 获取列表...
                    </div>
                  )}

                  {error && (
                    <div className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">
                      {error}
                    </div>
                  )}

                  {models && models.length > 0 && !fetching && (
                    <div className="text-[10px] text-gray-400">
                      已获取 {models.length} 个可用模型
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* 底部 */}
        <div className="border-t border-gray-200 px-5 py-4 flex items-center justify-between shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <RotateCcw size={16} />
            重置
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty}
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <Save size={16} />
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
