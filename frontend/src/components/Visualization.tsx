'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { GeometryData, FunctionPlotData, GeometryElement, Point } from '@/types';

interface GeometryViewProps {
  data: GeometryData;
  onPointDrag?: (label: string, x: number, y: number) => void;
}

/** 后端返回的 points/segments/circles 格式 → elements 格式 */
function normalizeGeometryData(raw: any): GeometryElement[] {
  const result: GeometryElement[] = [];

  // 已有 elements 格式，直接返回
  if (Array.isArray(raw.elements)) return raw.elements;

  // points: [[x, y], ...]
  if (Array.isArray(raw.points)) {
    raw.points.forEach((p: any, i: number) => {
      if (Array.isArray(p) && p.length >= 2) {
        result.push({ type: 'point', label: String(i), x: p[0], y: p[1], color: '#3b82f6' });
      }
    });
  }

  // segments: [[[x1,y1],[x2,y2]], ...]
  if (Array.isArray(raw.segments)) {
    let pointIdx = result.length;
    raw.segments.forEach((seg: any) => {
      if (Array.isArray(seg) && seg.length >= 2) {
        const p1 = seg[0], p2 = seg[1];
        const fromLabel = `seg_from_${pointIdx}`;
        const toLabel = `seg_to_${pointIdx}`;
        if (Array.isArray(p1) && p1.length >= 2 && Array.isArray(p2) && p2.length >= 2) {
          result.push({ type: 'point', label: fromLabel, x: p1[0], y: p1[1], color: '#ef4444' });
          result.push({ type: 'point', label: toLabel, x: p2[0], y: p2[1], color: '#ef4444' });
          result.push({ type: 'segment', from: fromLabel, to: toLabel, color: '#ef4444' });
        }
        pointIdx++;
      }
    });
  }

  // circles: ?（后端暂不返回）
  return result;
}

export function GeometryView({ data, onPointDrag }: GeometryViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<any>(null);

  // 归一化：后端返回 points/segments/circles 格式 → elements 格式
  const elements = normalizeGeometryData(data);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let JXG: any;
    try {
      JXG = (window as any).JXG ?? require('jsxgraph');
    } catch {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsxgraph/1.9.0/jsxgraphcore.js';
      script.onload = initBoard;
      document.head.appendChild(script);
      return;
    }

    initBoard();

    function initBoard() {
      if (!containerRef.current || boardRef.current) return;

      try {
        const board = JXG.JSXGraph.initBoard(containerRef.current.id, {
          boundingbox: [-8, 6, 8, -6],
          axis: true,
          grid: true,
          showCopyright: false,
          showNavigation: false,
          zoom: { factorX: 1.25, factorY: 1.25 },
          pan: { enabled: true, needShift: false },
        });

        const pointsMap: Record<string, any> = {};

        for (const el of elements) {
          if (el.type === 'point' && el.x !== undefined && el.y !== undefined) {
            const pt = board.create('point', [el.x, el.y], {
              name: el.label || '',
              size: 6,
              fixed: !onPointDrag,
              color: el.color || '#3b82f6',
              label: { fontSize: 14, offset: [12, -12] },
            });

            if (el.label) {
              pointsMap[el.label] = pt;
            }

            if (onPointDrag && el.label) {
              const label = el.label;
              pt.on('drag', function () {
                const coords = pt.coords;
                onPointDrag(label, coords.usrCoords[1], coords.usrCoords[2]);
              });
            }
          }
        }

        for (const el of elements) {
          if (el.type === 'segment' && el.from && el.to) {
            const p1 = pointsMap[el.from];
            const p2 = pointsMap[el.to];
            if (p1 && p2) {
              board.create('segment', [p1, p2], {
                strokeColor: el.color || '#ef4444',
                strokeWidth: 2,
              });
            }
          }

          if (el.type === 'line' && el.from && el.to) {
            const p1 = pointsMap[el.from];
            const p2 = pointsMap[el.to];
            if (p1 && p2) {
              board.create('line', [p1, p2], {
                strokeColor: el.color || '#8b5cf6',
                strokeWidth: 1.5,
                dash: 2,
              });
            }
          }

          if (el.type === 'circle' && el.center && el.radius) {
            const center = pointsMap[el.center];
            if (center) {
              board.create('circle', [center, el.radius], {
                strokeColor: el.color || '#10b981',
                strokeWidth: 1.5,
              });
            }
          }
        }

        boardRef.current = board;
      } catch (e) {
        console.error('JSXGraph init error:', e);
      }
    }

    return () => {
      if (boardRef.current) {
        try {
          JXG?.JSXGraph?.freeBoard(boardRef.current);
        } catch {}
        boardRef.current = null;
      }
    };
  }, [data, onPointDrag]);

  return (
    <div
      id={`jxg-${data.type}-${Date.now()}`}
      ref={containerRef}
      className="w-full h-full min-h-[400px] rounded-xl"
    />
  );
}


interface FunctionPlotViewProps {
  data: FunctionPlotData;
  onParamsChange?: (params: Record<string, number>) => void;
}

export function FunctionPlotView({ data, onParamsChange }: FunctionPlotViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    let Plotly: any;
    try {
      Plotly = require('plotly.js-dist-min');
    } catch {
      return;
    }

    const xVals = data.points.map(p => p.x);
    const yVals = data.points.map(p => p.y);

    const trace = {
      x: xVals,
      y: yVals,
      type: 'scatter' as const,
      mode: 'lines' as const,
      line: { color: '#6366f1', width: 2.5 },
      name: data.expression,
    };

    const layout = {
      autosize: true,
      margin: { l: 48, r: 16, t: 40, b: 48 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { size: 11 },
      xaxis: {
        title: 'x',
        gridcolor: '#e5e7eb',
        zerolinecolor: '#d1d5db',
        showgrid: true,
      },
      yaxis: {
        title: 'y',
        gridcolor: '#e5e7eb',
        zerolinecolor: '#d1d5db',
        showgrid: true,
      },
      dragmode: 'pan',
      hovermode: 'x',
    };

    Plotly.newPlot(containerRef.current, [trace], layout, {
      responsive: true,
      displayModeBar: false,
      scrollZoom: true,
    });

    if (onParamsChange) {
      const el = containerRef.current as any;
      el.on?.('plotly_relayout', () => {
        const gd = el;
        if (gd && gd.layout && gd.layout.xaxis && gd.layout.xaxis.range) {
          onParamsChange({
            x_min: gd.layout.xaxis.range[0],
            x_max: gd.layout.xaxis.range[1],
          });
        }
      });
    }

    return () => {
      if (containerRef.current) {
        try {
          Plotly.purge(containerRef.current);
        } catch {}
      }
    };
  }, [data, onParamsChange]);

  if (!data.points || data.points.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        无法渲染：没有数据点
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px]" />
  );
}


interface VisualizationProps {
  data: GeometryData | FunctionPlotData;
  onPointDrag?: (label: string, x: number, y: number) => void;
  onParamsChange?: (params: Record<string, number>) => void;
}

export function Visualization({ data, onPointDrag, onParamsChange }: VisualizationProps) {
  if (data.type === 'geometry') {
    return (
      <div className="w-full h-full">
        <GeometryView data={data as GeometryData} onPointDrag={onPointDrag} />
      </div>
    );
  }

  if (data.type === 'function_plot') {
    return (
      <div className="w-full h-full">
        <FunctionPlotView data={data as FunctionPlotData} onParamsChange={onParamsChange} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      不支持的可视化类型
    </div>
  );
}
