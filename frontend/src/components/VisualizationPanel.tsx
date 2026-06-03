'use client';

import { useState, useCallback, useRef } from 'react';
import { X, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Visualization } from './Visualization';
import type { VisualizationData, GeometryData, FunctionPlotData } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface VisualizationPanelProps {
  data: VisualizationData | null;
  onClose: () => void;
}

export function VisualizationPanel({ data, onClose }: VisualizationPanelProps) {
  const [currentData, setCurrentData] = useState<VisualizationData | null>(data);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handlePointDrag = useCallback(async (label: string, x: number, y: number) => {
    if (!currentData || currentData.type !== 'geometry') return;

    setInteracting(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/interact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visualization_type: 'geometry',
            params: {}, 
          }),
        });
        const result = await res.json();
        if (result.visualization_data) {
          setCurrentData(result.visualization_data as GeometryData);
        }
      } catch (err) {
        console.error('交互回传失败:', err);
      } finally {
        setInteracting(false);
      }
    }, 500);
  }, [currentData]);

  const handleParamsChange = useCallback(async (params: Record<string, number>) => {
    if (!currentData || currentData.type !== 'function_plot') return;

    setInteracting(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/interact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visualization_type: 'function_plot',
            params: {
              expression: (currentData as FunctionPlotData).expression,
              ...params,
            },
          }),
        });
        const result = await res.json();
        if (result.visualization_data) {
          setCurrentData(result.visualization_data as FunctionPlotData);
        }
      } catch (err) {
        console.error('交互回传失败:', err);
      } finally {
        setInteracting(false);
      }
    }, 500);
  }, [currentData]);

  const handleRefresh = useCallback(async () => {
    if (!currentData) return;
    setInteracting(true);
    try {
      const visType = currentData.type === 'geometry' ? 'geometry' : 'function_plot';
      const res = await fetch(`${API_BASE}/api/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visualization_type: visType,
          params: {},
        }),
      });
      const result = await res.json();
      if (result.visualization_data) {
        setCurrentData(result.visualization_data as VisualizationData);
      }
    } catch (err) {
      console.error('刷新失败:', err);
    } finally {
      setInteracting(false);
    }
  }, [currentData]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {currentData?.type === 'geometry' ? '几何可视化' : '函数绘图'}
          </span>
          {currentData?.type === 'geometry' && (
            <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">
              可拖动
            </span>
          )}
          {interacting && (
            <RefreshCw size={14} className="text-indigo-500 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="重新渲染"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className={`flex-1 p-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-white p-6' : ''}`}>
        {currentData ? (
          <Visualization
            data={currentData}
            onPointDrag={handlePointDrag}
            onParamsChange={handleParamsChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <div className="text-center">
              <div className="text-4xl mb-2">📐</div>
              <p>在聊天中发送问题</p>
              <p className="text-xs mt-1">可视化数据将在这里显示</p>
            </div>
          </div>
        )}
      </div>

      {currentData?.type === 'geometry' && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
            蓝色点可拖动 — 拖动后自动更新计算结果
          </p>
        </div>
      )}
    </div>
  );
}
