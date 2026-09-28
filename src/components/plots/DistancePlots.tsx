import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import type { DistanceRow, OffsetPlotDetail, ProfilePlotDetail, RangePlotDetail } from '../../services/wellDistance';
import { fmt } from '../../utils/format';

interface HoverTarget {
  key: string;
  x: number;
  y: number;
  title: string;
  lines: Array<[string, string]>;
}

interface PlotBaseProps {
  emptyMessage?: string;
}

interface Axis {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  left: number;
  top: number;
  plotWidth: number;
  plotHeight: number;
  xMax: number;
  yMax: number;
  X: (value: number) => number;
  Y: (value: number) => number;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function niceStep(maxValue: number, target = 6): number {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 1;
  const raw = maxValue / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * power;
}

const WELL_PALETTE = ['#4f9cf9', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185', '#84cc16', '#e879f9', '#facc15', '#38bdf8', '#fb923c'];

function wellColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (Math.imul(hash, 31) + name.charCodeAt(i)) >>> 0;
  return WELL_PALETTE[hash % WELL_PALETTE.length];
}

function setupCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || canvas.parentElement?.clientWidth || 700));
  const height = Math.max(240, Math.round(rect.height || canvas.parentElement?.clientHeight || 360));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawAxes(
  canvas: HTMLCanvasElement,
  xValueMax: number,
  yValueMax: number,
  yLabel: string,
  radiusLine?: number | null,
): Axis | null {
  const base = setupCanvas(canvas);
  if (!base) return null;
  const { ctx, width, height } = base;
  const left = 76;
  const right = 24;
  const top = 18;
  const bottom = 52;
  const plotWidth = Math.max(10, width - left - right);
  const plotHeight = Math.max(10, height - top - bottom);
  const text = cssVar('--text', '#e7edf5');
  const muted = cssVar('--muted', '#8496ad');
  const line = cssVar('--line', '#26323f');
  const grid = cssVar('--panel-3', '#223041');

  const xStep = niceStep(Math.max(1, xValueMax), 6);
  const xMax = Math.max(xStep, Math.ceil(Math.max(1, xValueMax) / xStep) * xStep);
  const yStep = niceStep(Math.max(1, yValueMax), 7);
  const yMax = Math.max(yStep, Math.ceil(Math.max(1, yValueMax) / yStep) * yStep);
  const X = (value: number) => left + (Math.max(0, Math.min(xMax, value)) / xMax) * plotWidth;
  // WTM convention: depth axis is inverted, with 0 ft at the top.
  const Y = (value: number) => top + (Math.max(0, Math.min(yMax, value)) / yMax) * plotHeight;

  ctx.font = `11px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  for (let x = 0; x <= xMax + xStep * 0.25; x += xStep) {
    const px = X(x);
    ctx.strokeStyle = grid;
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + plotHeight); ctx.stroke();
    ctx.fillStyle = muted; ctx.textAlign = 'center';
    ctx.fillText(fmt(x, xStep < 1 ? 2 : xStep < 10 ? 1 : 0), px, top + plotHeight + 18);
  }
  for (let y = 0; y <= yMax + yStep * 0.25; y += yStep) {
    const py = Y(y);
    ctx.strokeStyle = grid;
    ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(left + plotWidth, py); ctx.stroke();
    ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText(fmt(y, 0), left - 8, py);
  }
  ctx.strokeStyle = line; ctx.lineWidth = 1.2; ctx.strokeRect(left, top, plotWidth, plotHeight);
  ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.font = `600 11px ${getComputedStyle(document.body).fontFamily}`;
  ctx.fillText('Distance (m)', left + plotWidth / 2, height - 15);
  ctx.save(); ctx.translate(18, top + plotHeight / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();

  if (radiusLine != null && Number.isFinite(radiusLine) && radiusLine >= 0 && radiusLine <= xMax) {
    const x = X(radiusLine);
    ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = cssVar('--warn', '#fbbf24'); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotHeight); ctx.stroke(); ctx.restore();
    ctx.fillStyle = cssVar('--warn', '#fbbf24');
    ctx.textAlign = x > left + plotWidth * 0.78 ? 'right' : 'left';
    ctx.fillText(`Radius ${fmt(radiusLine, 1)} m`, x + (x > left + plotWidth * 0.78 ? -5 : 5), top + 10);
  }

  return { ctx, width, height, left, top, plotWidth, plotHeight, xMax, yMax, X, Y };
}

function usePlotRefresh(canvasRef: RefObject<HTMLCanvasElement | null>): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = new ResizeObserver(() => setRevision(value => value + 1));
    resize.observe(canvas);
    const theme = new MutationObserver(() => setRevision(value => value + 1));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { resize.disconnect(); theme.disconnect(); };
  }, [canvasRef]);
  return revision;
}

function nearestHover(targets: HoverTarget[], event: MouseEvent<HTMLCanvasElement>): HoverTarget | null {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best: HoverTarget | null = null;
  let bestDistance2 = 12 * 12;
  for (const target of targets) {
    const dx = x - target.x;
    const dy = y - target.y;
    const distance2 = dx * dx + dy * dy;
    if (distance2 < bestDistance2) {
      bestDistance2 = distance2;
      best = target;
    }
  }
  return best;
}

function PlotFrame({
  canvasRef,
  targets,
  hover,
  setHover,
  children,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  targets: HoverTarget[];
  hover: HoverTarget | null;
  setHover: (target: HoverTarget | null) => void;
  children?: ReactNode;
}) {
  return <div className="distance-plot-wrap">
    <canvas
      ref={canvasRef}
      className="distance-plot"
      onMouseMove={event => setHover(nearestHover(targets, event))}
      onMouseLeave={() => setHover(null)}
    />
    {children}
    {hover ? <div className="distance-hover-tip" style={{ left: Math.max(6, hover.x + 12), top: Math.max(6, hover.y + 12) }}>
      <b>{hover.title}</b>
      {hover.lines.map(([label, value]) => <div className="line" key={label}><span>{label}</span><span>{value}</span></div>)}
    </div> : null}
  </div>;
}

export function RangeDistancePlot({ details, radius, mode, emptyMessage = 'No valid search results to plot.' }: PlotBaseProps & {
  details: RangePlotDetail[];
  radius: number;
  mode: '2d' | '3d';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revision = usePlotRefresh(canvasRef);
  const [targets, setTargets] = useState<HoverTarget[]>([]);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverKey = hover?.key ?? '';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const usable = details.filter(item => Number.isFinite(item.distance));
    const yValues: number[] = [];
    for (const item of usable) {
      if (Number.isFinite(item.closestFt)) yValues.push(item.closestFt);
      for (const interval of item.intervalsFt) yValues.push(interval.from, interval.to);
    }
    if (!usable.length || !yValues.length) {
      const axis = drawAxes(canvas, 1, 1, 'Offset ftMD', null);
      if (axis) {
        axis.ctx.fillStyle = cssVar('--muted', '#8496ad');
        axis.ctx.textAlign = 'center';
        axis.ctx.fillText(emptyMessage, axis.left + axis.plotWidth / 2, axis.top + axis.plotHeight / 2);
      }
      setTargets([]);
      return;
    }
    const maxDistance = Math.max(...usable.map(item => item.distance));
    const xLimit = Math.max(radius, maxDistance) * 1.02;
    const yMax = Math.max(1, ...yValues) * 1.02;
    const axis = drawAxes(canvas, xLimit, yMax, 'Offset ftMD', radius);
    if (!axis) return;
    const accent = cssVar('--accent', '#4f9cf9');
    const nextTargets: HoverTarget[] = [];
    for (const item of usable) {
      const x = axis.X(item.distance);
      const hot = hoverKey === item.well;
      axis.ctx.strokeStyle = accent;
      axis.ctx.lineWidth = hot ? 5 : 3;
      axis.ctx.globalAlpha = hot ? 1 : 0.58;
      for (const interval of item.intervalsFt) {
        const y1 = axis.Y(interval.from);
        const y2 = axis.Y(interval.to);
        axis.ctx.beginPath(); axis.ctx.moveTo(x, y1); axis.ctx.lineTo(x, y2); axis.ctx.stroke();
        const lo = Math.min(y1, y2);
        const hi = Math.max(y1, y2);
        for (let y = lo; y <= hi + 0.1; y += 7) nextTargets.push({
          key: item.well, x, y: Math.min(y, hi), title: item.well,
          lines: [['Minimum distance', `${fmt(item.distance, 3)} m`], ['Radius interval', `${fmt(interval.from, 1)}–${fmt(interval.to, 1)} ftMD`]],
        });
      }
      axis.ctx.globalAlpha = 1;
      if (Number.isFinite(item.closestFt)) {
        const y = axis.Y(item.closestFt);
        axis.ctx.fillStyle = accent; axis.ctx.beginPath(); axis.ctx.arc(x, y, hot ? 6 : 4, 0, Math.PI * 2); axis.ctx.fill();
        nextTargets.push({ key: item.well, x, y, title: item.well, lines: [['Distance', `${fmt(item.distance, 3)} m`], ['Closest ftMD', `${fmt(item.closestFt, 1)} ft`]] });
      }
    }
    setTargets(nextTargets);
  }, [details, radius, mode, revision, hoverKey, emptyMessage]);

  return <PlotFrame canvasRef={canvasRef} targets={targets} hover={hover} setHover={setHover} />;
}

export function PairDistancePlot({ rows, title, emptyMessage = 'No valid distance values to plot.' }: PlotBaseProps & {
  rows: DistanceRow[];
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revision = usePlotRefresh(canvasRef);
  const [targets, setTargets] = useState<HoverTarget[]>([]);
  const [hover, setHover] = useState<HoverTarget | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const valid = rows.filter(row => row['Distance (meter)'] !== '' && row['Reference ftMD'] !== '' && Number.isFinite(Number(row['Distance (meter)'])) && Number.isFinite(Number(row['Reference ftMD'])));
    if (!valid.length) {
      const axis = drawAxes(canvas, 1, 1, 'Reference ftMD', null);
      if (axis) {
        axis.ctx.fillStyle = cssVar('--muted', '#8496ad'); axis.ctx.textAlign = 'center';
        axis.ctx.fillText(emptyMessage, axis.left + axis.plotWidth / 2, axis.top + axis.plotHeight / 2);
      }
      setTargets([]);
      return;
    }
    const xMax = Math.max(...valid.map(row => Number(row['Distance (meter)'])));
    const yMax = Math.max(1, ...rows.map(row => Number(row['Reference ftMD']) || 0));
    const axis = drawAxes(canvas, xMax * 1.05, yMax * 1.02, 'Reference ftMD', null);
    if (!axis) return;
    const accent = cssVar('--accent', '#4f9cf9');
    axis.ctx.strokeStyle = accent; axis.ctx.lineWidth = 1.7; axis.ctx.beginPath();
    let started = false;
    const mapped: Array<{ x: number; y: number; row: DistanceRow }> = [];
    for (const row of rows) {
      if (row['Distance (meter)'] === '' || row['Reference ftMD'] === '') { started = false; continue; }
      const distance = Number(row['Distance (meter)']);
      const md = Number(row['Reference ftMD']);
      if (!Number.isFinite(distance) || !Number.isFinite(md)) { started = false; continue; }
      const x = axis.X(distance); const y = axis.Y(md);
      if (!started) { axis.ctx.moveTo(x, y); started = true; } else axis.ctx.lineTo(x, y);
      mapped.push({ x, y, row });
    }
    axis.ctx.stroke();
    const minimum = valid.reduce((best, row) => Number(row['Distance (meter)']) < Number(best['Distance (meter)']) ? row : best, valid[0]);
    axis.ctx.fillStyle = accent; axis.ctx.beginPath(); axis.ctx.arc(axis.X(Number(minimum['Distance (meter)'])), axis.Y(Number(minimum['Reference ftMD'])), 4, 0, Math.PI * 2); axis.ctx.fill();

    const nextTargets: HoverTarget[] = [];
    let lastX = Infinity; let lastY = Infinity;
    for (const item of mapped) {
      if (Math.hypot(item.x - lastX, item.y - lastY) < 3.5) continue;
      nextTargets.push({
        key: 'pair', x: item.x, y: item.y, title,
        lines: [
          ['Distance', `${fmt(Number(item.row['Distance (meter)']), 3)} m`],
          ['Reference ftMD', `${fmt(Number(item.row['Reference ftMD']), 1)} ft`],
          ['Offset ftMD', item.row['Offset ftMD'] === '' ? '—' : `${fmt(Number(item.row['Offset ftMD']), 1)} ft`],
          ['Reference mASL', `${fmt(Number(item.row['Reference mASL']), 2)} m`],
        ],
      });
      lastX = item.x; lastY = item.y;
    }
    setTargets(nextTargets);
  }, [rows, title, revision, emptyMessage]);

  return <PlotFrame canvasRef={canvasRef} targets={targets} hover={hover} setHover={setHover} />;
}

export function MultiProfileDistancePlot({
  offsetDetails,
  selectedDetails,
  radius,
  yLabel,
  emptyMessage = 'No valid distance profiles to plot.',
}: PlotBaseProps & {
  offsetDetails?: OffsetPlotDetail[];
  selectedDetails?: ProfilePlotDetail[];
  radius?: number | null;
  yLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revision = usePlotRefresh(canvasRef);
  const [targets, setTargets] = useState<HoverTarget[]>([]);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverKey = hover?.key ?? '';

  const series = useMemo(() => {
    if (offsetDetails) return offsetDetails.map(detail => ({ well: detail.well, segments: detail.profiles, min: { distance: detail.distance, ft: detail.closestFt } }));
    return (selectedDetails || []).map(detail => ({ well: detail.well, segments: [detail.points], min: detail.min }));
  }, [offsetDetails, selectedDetails]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const allPoints = series.flatMap(item => item.segments.flatMap(segment => segment));
    if (!allPoints.length) {
      const axis = drawAxes(canvas, 1, 1, yLabel, radius ?? null);
      if (axis) {
        axis.ctx.fillStyle = cssVar('--muted', '#8496ad'); axis.ctx.textAlign = 'center';
        axis.ctx.fillText(emptyMessage, axis.left + axis.plotWidth / 2, axis.top + axis.plotHeight / 2);
      }
      setTargets([]);
      return;
    }
    const maxDistance = Math.max(...allPoints.map(point => point.distance));
    const yMax = Math.max(1, ...allPoints.map(point => point.ft)) * 1.02;
    const xLimit = radius != null ? Math.max(radius, maxDistance) * 1.02 : maxDistance * 1.05;
    const axis = drawAxes(canvas, xLimit, yMax, yLabel, radius ?? null);
    if (!axis) return;
    const nextTargets: HoverTarget[] = [];
    for (const item of series) {
      const color = wellColor(item.well);
      const hot = hoverKey === item.well;
      axis.ctx.strokeStyle = color; axis.ctx.lineWidth = hot ? 3.4 : 1.8; axis.ctx.globalAlpha = hot ? 1 : 0.9;
      for (const segment of item.segments) {
        let started = false;
        let lastX = Infinity; let lastY = Infinity;
        axis.ctx.beginPath();
        for (const point of segment) {
          if (!Number.isFinite(point.distance) || !Number.isFinite(point.ft)) { started = false; continue; }
          const x = axis.X(point.distance); const y = axis.Y(point.ft);
          if (!started) { axis.ctx.moveTo(x, y); started = true; } else axis.ctx.lineTo(x, y);
          if (Math.hypot(x - lastX, y - lastY) >= 3.5) {
            nextTargets.push({ key: item.well, x, y, title: item.well, lines: [['Distance', `${fmt(point.distance, 3)} m`], [yLabel, `${fmt(point.ft, 1)} ft`]] });
            lastX = x; lastY = y;
          }
        }
        axis.ctx.stroke();
      }
      axis.ctx.globalAlpha = 1;
      if (item.min && Number.isFinite(item.min.distance) && Number.isFinite(item.min.ft)) {
        axis.ctx.fillStyle = color; axis.ctx.beginPath(); axis.ctx.arc(axis.X(item.min.distance), axis.Y(item.min.ft), hot ? 5.5 : 3.8, 0, Math.PI * 2); axis.ctx.fill();
      }
    }
    setTargets(nextTargets);
  }, [series, radius, yLabel, revision, hoverKey, emptyMessage]);

  return <>
    <div className="distance-plot-legend">
      {series.map(item => <span className="item" key={item.well}><span className="line" style={{ background: wellColor(item.well) }} />{item.well}</span>)}
    </div>
    <PlotFrame canvasRef={canvasRef} targets={targets} hover={hover} setHover={setHover} />
  </>;
}
