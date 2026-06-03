'use client';

import { useState, useCallback, useRef } from 'react';
import { Chat } from '@/components/Chat';
import { VisualizationPanel } from '@/components/VisualizationPanel';
import type { VisualizationData } from '@/types';

export default function Home() {
  const [visualizationData, setVisualizationData] = useState<VisualizationData | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleVisualization = useCallback((data: VisualizationData) => {
    setVisualizationData(data);
    setIsPanelOpen(true);
  }, []);

  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  return (
    <main className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white/80 backdrop-blur border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
            ∫
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 leading-tight">Math Copilot</h1>
            <p className="text-xs text-gray-500">数学大模型约束工程</p>
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
        <div className="flex-1 flex flex-col min-w-0">
          <Chat onVisualization={handleVisualization} />
        </div>

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
