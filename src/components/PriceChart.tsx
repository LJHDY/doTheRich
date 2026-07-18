import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartDataRow, ChartSeries } from '../types';

interface PriceChartProps {
  rows: ChartDataRow[];
  series: ChartSeries[];
}

// 날짜 + 해당 시점의 모든 시리즈 값을 한눈에 표시하는 커스텀 툴팁
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '10px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '13px',
        minWidth: '140px',
      }}
    >
      <p style={{ color: '#5f6368', marginBottom: '6px', fontWeight: 600 }}>{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color, margin: '2px 0' }}>
          {entry.name}: <strong>{entry.value}억</strong>
        </p>
      ))}
    </div>
  );
};

const PriceChart: React.FC<PriceChartProps> = ({ rows, series }) => {
  if (!rows?.length || !series?.length) {
    return (
      <div
        style={{
          height: '200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9e9e9e',
          fontSize: '14px',
          backgroundColor: '#fafafa',
          borderRadius: '8px',
          border: '1px dashed #e0e0e0',
        }}
      >
        시세 데이터가 없습니다
      </div>
    );
  }

  // 모든 시리즈 값을 수집해 Y축 도메인 계산
  const allValues: number[] = [];
  rows.forEach(row => {
    series.forEach(s => {
      const v = row[s.key];
      if (typeof v === 'number') allValues.push(v);
    });
  });
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const padding = (maxV - minV) * 0.2 || 0.5;

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#9e9e9e' }}
            tickFormatter={(val: string) => {
              const parts = val.split('-');
              return parts.length >= 2 ? `${parts[0].slice(2)}.${parts[1]}` : val;
            }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9e9e9e' }}
            domain={[Math.max(0, minV - padding), maxV + padding]}
            tickFormatter={(v: number) => `${v.toFixed(1)}억`}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          {series.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              // 전세가는 점선으로 매매가와 구분
              strokeDasharray={s.type === 'jeonse' ? '5 3' : undefined}
              dot={{ fill: s.color, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* 범례: 매매가(실선) · 전세가(점선)를 색상과 함께 표시 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          marginTop: '8px',
          padding: '0 4px',
        }}
      >
        {series.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="22" height="8">
              <line
                x1="0" y1="4" x2="22" y2="4"
                stroke={s.color}
                strokeWidth="2.5"
                strokeDasharray={s.type === 'jeonse' ? '5 3' : undefined}
              />
            </svg>
            <span style={{ fontSize: '11px', color: '#5f6368' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PriceChart;
