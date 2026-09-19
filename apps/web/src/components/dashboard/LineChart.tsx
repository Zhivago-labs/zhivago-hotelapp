"use client";

import { useId, useMemo, useState } from "react";
import styles from "./LineChart.module.css";

export interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  title: string;
  data: LineChartPoint[];
  color: string;
  /** Funções não atravessam a fronteira Server → Client Component; por isso o formato é
   *  um identificador serializável, não um callback. */
  format?: "number" | "currency";
}

const WIDTH = 600;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };

function niceMax(value: number): number {
  if (value <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

const formatters: Record<NonNullable<LineChartProps["format"]>, (value: number) => string> = {
  number: (value) => value.toLocaleString("pt-BR"),
  currency: (value) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
};

export function LineChart({ title, data, color, format = "number" }: LineChartProps) {
  const formatValue = formatters[format];
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data]);

  const points = data.map((d, i) => {
    const x = PADDING.left + (data.length > 1 ? (i / (data.length - 1)) * plotWidth : plotWidth / 2);
    const y = PADDING.top + plotHeight - (d.value / max) * plotHeight;
    return { ...d, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? PADDING.left},${PADDING.top + plotHeight} L${points[0]?.x ?? PADDING.left},${PADDING.top + plotHeight} Z`;

  const yTicks = [0, 0.5, 1].map((f) => Math.round(max * f));

  const active = activeIndex !== null ? points[activeIndex] : null;

  const handlePointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    if (points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relativeX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setActiveIndex(nearest);
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{title}</h3>

      <div className={styles.chartWrap}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={styles.svg}
          role="img"
          aria-label={title}
          onPointerLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.1} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {yTicks.map((tick, i) => {
            const y = PADDING.top + plotHeight - (tick / max) * plotHeight;
            return (
              <g key={tick + "-" + i}>
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  className={styles.gridline}
                />
                <text x={PADDING.left - 8} y={y} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}

          {points.map((p, i) => (
            <text
              key={p.label + i}
              x={p.x}
              y={HEIGHT - 6}
              className={styles.axisLabel}
              textAnchor="middle"
            >
              {p.label}
            </text>
          ))}

          {points.length > 0 && (
            <>
              <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
              <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}

          {active && (
            <line
              x1={active.x}
              x2={active.x}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
              className={styles.crosshair}
            />
          )}

          {points.map((p, i) => (
            <circle
              key={"dot-" + p.label + i}
              cx={p.x}
              cy={p.y}
              r={activeIndex === i ? 5 : 4}
              fill={color}
              stroke="var(--card-bg)"
              strokeWidth={2}
              tabIndex={0}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
            />
          ))}

          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActiveIndex(null)}
          />
        </svg>

        {active && (
          <div
            className={styles.tooltip}
            style={{ left: `${(active.x / WIDTH) * 100}%`, top: `${(active.y / HEIGHT) * 100}%` }}
          >
            <strong>{formatValue(active.value)}</strong>
            <span>{active.label}</span>
          </div>
        )}
      </div>

      <details className={styles.tableDetails}>
        <summary>Ver dados em tabela</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Período</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.label + i}>
                <td>{d.label}</td>
                <td>{formatValue(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
