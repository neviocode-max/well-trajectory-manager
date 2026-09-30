import { clamp } from '../../engine/constants';
import type { StudioMark2D, StudioSeries } from '../../types/studio';
import { fmt } from '../../utils/format';
import { downloadBlob } from '../../services/browserFiles';

export function themeColor(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
}

export async function exportCanvasPNG(canvas: HTMLCanvasElement, name: string): Promise<boolean> {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = themeColor('--bg') || '#0e141b';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
  if (!blob) return false;
  downloadBlob(name, blob);
  return true;
}

export interface StudioChartHit {
  series: StudioSeries;
  index: number;
  x: number;
  y: number;
  color: string;
}

export interface StudioChartReferenceLine {
  axis?: 'x' | 'y';
  value: number;
  label?: string;
  color?: string;
}

export interface StudioChartOptions {
  id: string;
  xLabel?: string;
  yLabel?: string;
  equalAspect?: boolean;
  yDown?: boolean;
  includeYZero?: boolean;
  wrap360?: boolean;
  markers?: boolean;
}

export interface StudioChartDisplayOptions {
  equalAspect?: boolean;
  yDown?: boolean;
  includeYZero?: boolean;
  wrap360?: boolean;
  showStations?: boolean;
  showLabels?: boolean;
  showGrid?: boolean;
}

export interface StudioChartApi {
  setSeries(series: StudioSeries[], keepView?: boolean): void;
  setAxes(xLabel: string, yLabel: string): void;
  setOptions(options: StudioChartDisplayOptions): void;
  setMarks(marks: StudioMark2D[]): void;
  setSelected(selected: { x: number; y: number } | null): void;
  setReferenceLines(lines: StudioChartReferenceLine[]): void;
  on(event: 'hover', callback: ((hit: StudioChartHit | null, px?: number, py?: number) => void) | null): void;
  on(event: 'pick', callback: ((hit: StudioChartHit) => void) | null): void;
  reset(): void;
  redraw(): void;
  resize(): void;
  series(): StudioSeries[];
  exportPNG(name: string): Promise<boolean>;
  destroy(): void;
}

export function createStudioChart(canvas: HTMLCanvasElement, config: StudioChartOptions): StudioChartApi {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  const ctx: CanvasRenderingContext2D = context;
  const state = {
    series: [] as StudioSeries[],
    xLabel: config.xLabel || 'X', yLabel: config.yLabel || 'Y',
    equalAspect: Boolean(config.equalAspect), yDown: Boolean(config.yDown),
    includeYZero: Boolean(config.includeYZero), wrap360: Boolean(config.wrap360),
    showStations: false, showLabels: true, showGrid: true,
    cx: 0, cy: 0, sx: 1, sy: 1, fitted: false,
    hover: null as StudioChartHit | null,
    marks: [] as StudioMark2D[], selected: null as { x: number; y: number } | null,
    referenceLines: [] as StudioChartReferenceLine[],
    dpr: 1, w: 0, h: 0,
    pad: { l: 62, r: 16, t: 14, b: 40 },
  };
  let raf = 0;
  let dragging = false;
  let dragMoved = false;
  let lastX = 0;
  let lastY = 0;
  let touch: { mode: 'pan' | 'pinch'; x: number; y: number; distance: number; moved: boolean } | null = null;
  let hoverListener: ((hit: StudioChartHit | null, px?: number, py?: number) => void) | null = null;
  let pickListener: ((hit: StudioChartHit) => void) | null = null;

  function resizeInternal(): boolean {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(50, Math.round(rect.width));
    const h = Math.max(50, Math.round(rect.height));
    if (state.w === w && state.h === h && state.dpr === dpr) return false;
    state.w = w; state.h = h; state.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    return true;
  }
  const plotW = () => Math.max(10, state.w - state.pad.l - state.pad.r);
  const plotH = () => Math.max(10, state.h - state.pad.t - state.pad.b);
  const midX = () => state.pad.l + plotW() / 2;
  const midY = () => state.pad.t + plotH() / 2;
  const sxOf = (x: number) => midX() + (x - state.cx) / state.sx;
  const syOf = (y: number) => state.yDown ? midY() + (y - state.cy) / state.sy : midY() - (y - state.cy) / state.sy;
  const xOfS = (px: number) => state.cx + (px - midX()) * state.sx;
  const yOfS = (py: number) => state.yDown ? state.cy + (py - midY()) * state.sy : state.cy - (py - midY()) * state.sy;

  function bounds() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const series of state.series) {
      for (let i = 0; i < series.n; i++) {
        const x = series.x[i], y = series.y[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!Number.isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
    if (state.includeYZero) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
    if (x1 - x0 < 1e-9) { x0 -= 1; x1 += 1; }
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    return { x0, x1, y0, y1 };
  }

  function fit() {
    resizeInternal();
    const b = bounds();
    state.cx = (b.x0 + b.x1) / 2;
    state.cy = (b.y0 + b.y1) / 2;
    const margin = 1.12;
    state.sx = (b.x1 - b.x0) * margin / plotW();
    state.sy = (b.y1 - b.y0) * margin / plotH();
    if (state.equalAspect) {
      const scale = Math.max(state.sx, state.sy);
      state.sx = scale; state.sy = scale;
    }
    state.fitted = state.series.length > 0;
    schedule();
  }

  function niceStep(range: number, targetCount: number): number {
    const rough = range / Math.max(1, targetCount);
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(rough, Number.EPSILON))));
    const norm = rough / pow;
    return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * pow;
  }
  function ticks(lo: number, hi: number, count: number): number[] {
    const step = niceStep(hi - lo, count);
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }

  function draw() {
    resizeInternal();
    const dpr = state.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, state.w, state.h);
    const grid = themeColor('--grid');
    const axis = themeColor('--axis');
    const muted = themeColor('--muted');
    const L = state.pad.l, T = state.pad.t, W = plotW(), H = plotH();
    const xLo = xOfS(L), xHi = xOfS(L + W);
    const yA = yOfS(T), yB = yOfS(T + H);
    const yLo = Math.min(yA, yB), yHi = Math.max(yA, yB);

    ctx.save();
    ctx.beginPath(); ctx.rect(L, T, W, H); ctx.clip();
    if (state.showGrid) {
      ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath();
      for (const tick of ticks(xLo, xHi, 8)) { const px = Math.round(sxOf(tick)) + .5; ctx.moveTo(px, T); ctx.lineTo(px, T + H); }
      for (const tick of ticks(yLo, yHi, 6)) { const py = Math.round(syOf(tick)) + .5; ctx.moveTo(L, py); ctx.lineTo(L + W, py); }
      ctx.stroke();
    }

    for (const line of state.referenceLines) {
      if (!Number.isFinite(line.value) || (line.axis || 'x') !== 'x') continue;
      const px = sxOf(line.value);
      if (px < L || px > L + W) continue;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = line.color || themeColor('--warn'); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, T + H); ctx.stroke(); ctx.setLineDash([]);
      if (line.label) {
        ctx.fillStyle = line.color || themeColor('--warn'); ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(line.label, Math.min(px + 5, L + W - 90), T + 5);
      }
      ctx.restore();
    }

    const labelCandidates: Array<{ label: string; color: string; x: number; y: number; primary: boolean }> = [];
    for (const series of state.series) {
      if (!series.n) continue;
      const step = Math.max(1, Math.floor(series.n / (W * 2)));
      ctx.strokeStyle = series.color; ctx.lineWidth = series.width || 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false; let previousX: number | null = null;
      for (let i = 0; i < series.n; i += step) {
        const xv = series.x[i], yv = series.y[i];
        if (!Number.isFinite(xv) || !Number.isFinite(yv)) { started = false; previousX = null; continue; }
        const px = sxOf(xv), py = syOf(yv);
        const wrapBreak = state.wrap360 && previousX != null && Math.abs(xv - previousX) > 180;
        if (!started || wrapBreak) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        previousX = xv;
      }
      const last = series.n - 1;
      if (last >= 0 && Number.isFinite(series.x[last]) && Number.isFinite(series.y[last])) {
        const wrapBreak = state.wrap360 && previousX != null && Math.abs(series.x[last] - previousX) > 180;
        if (!started || wrapBreak) ctx.moveTo(sxOf(series.x[last]), syOf(series.y[last]));
        else ctx.lineTo(sxOf(series.x[last]), syOf(series.y[last]));
      }
      ctx.stroke();

      if (state.showStations && series.n / step < 4000) {
        ctx.fillStyle = series.color;
        for (let i = 0; i < series.n; i += step) {
          ctx.beginPath(); ctx.arc(sxOf(series.x[i]), syOf(series.y[i]), 2.1, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (config.markers) {
        ctx.fillStyle = series.color; ctx.beginPath(); ctx.arc(sxOf(series.x[0]), syOf(series.y[0]), 4, 0, Math.PI * 2); ctx.fill();
      }
      if (state.showLabels && last >= 0 && Number.isFinite(series.x[last]) && Number.isFinite(series.y[last])) {
        labelCandidates.push({ label: series.label, color: series.color, x: sxOf(series.x[last]) + 8, y: syOf(series.y[last]), primary: series.primary });
      }
    }

    if (state.showLabels && labelCandidates.length) {
      const placed: Array<{ l: number; r: number; t: number; b: number }> = [];
      const overlap = (a: { l:number;r:number;t:number;b:number }, b: { l:number;r:number;t:number;b:number }) => !(a.r < b.l || a.l > b.r || a.b < b.t || a.t > b.b);
      ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      labelCandidates.sort((a, b) => Number(b.primary) - Number(a.primary));
      for (const candidate of labelCandidates) {
        const width = ctx.measureText(candidate.label).width;
        const offsets = [0, -14, 14, -28, 28, -42, 42];
        let chosen: { x: number; y: number; box: { l:number;r:number;t:number;b:number } } | null = null;
        for (const dy of offsets) {
          const x = clamp(candidate.x, L + 3, L + W - width - 3);
          const y = clamp(candidate.y + dy, T + 8, T + H - 8);
          const box = { l: x - 2, r: x + width + 2, t: y - 7, b: y + 7 };
          if (candidate.primary || !placed.some(item => overlap(box, item))) { chosen = { x, y, box }; break; }
        }
        if (!chosen) continue;
        ctx.fillStyle = candidate.color; ctx.fillText(candidate.label, chosen.x, chosen.y); placed.push(chosen.box);
      }
    }

    for (const mark of state.marks) {
      if (mark.view !== config.id) continue;
      ctx.strokeStyle = themeColor('--warn'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sxOf(mark.x), syOf(mark.y), 6, 0, Math.PI * 2); ctx.stroke();
    }
    if (state.marks.length === 2 && state.marks[0].view === config.id && state.marks[1].view === config.id) {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = themeColor('--warn'); ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(sxOf(state.marks[0].x), syOf(state.marks[0].y)); ctx.lineTo(sxOf(state.marks[1].x), syOf(state.marks[1].y)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (state.selected) {
      ctx.strokeStyle = themeColor('--text'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sxOf(state.selected.x), syOf(state.selected.y), 7, 0, Math.PI * 2); ctx.stroke();
    }
    if (state.hover) {
      ctx.fillStyle = state.hover.color; ctx.beginPath(); ctx.arc(sxOf(state.hover.x), syOf(state.hover.y), 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = axis; ctx.lineWidth = 1; ctx.strokeRect(L + .5, T + .5, W, H);
    ctx.fillStyle = muted; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const tick of ticks(xLo, xHi, 8)) ctx.fillText(fmt(tick, 2), sxOf(tick), T + H + 6);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const tick of ticks(yLo, yHi, 6)) ctx.fillText(fmt(tick, 2), L - 7, syOf(tick));
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = '600 11.5px system-ui, sans-serif'; ctx.fillText(state.xLabel, L + W / 2, state.h - 6);
    ctx.save(); ctx.translate(12, T + H / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'; ctx.fillText(state.yLabel, 0, 0); ctx.restore();
  }

  function nearest(px: number, py: number, maxDist = 14): StudioChartHit | null {
    let best: StudioChartHit | null = null;
    let bestD = maxDist * maxDist;
    for (const series of state.series) {
      const step = Math.max(1, Math.floor(series.n / 6000));
      for (let i = 0; i < series.n; i += step) {
        const xv = series.x[i], yv = series.y[i];
        if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
        const dx = sxOf(xv) - px, dy = syOf(yv) - py;
        const distance = dx * dx + dy * dy;
        if (distance < bestD) { bestD = distance; best = { series, index: i, x: xv, y: yv, color: series.color }; }
      }
    }
    return best;
  }
  function localPos(event: MouseEvent | WheelEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }
  function localTouch(point: Touch): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [point.clientX - rect.left, point.clientY - rect.top];
  }
  function touchMetrics(list: TouchList): { x: number; y: number; distance: number } {
    const a = localTouch(list[0]);
    if (list.length < 2) return { x: a[0], y: a[1], distance: 0 };
    const b = localTouch(list[1]);
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, distance: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  }
  const onMouseDown = (event: MouseEvent) => { dragging = true; dragMoved = false; const [x, y] = localPos(event); lastX = x; lastY = y; canvas.classList.add('grabbing'); };
  const onWindowUp = () => { dragging = false; canvas.classList.remove('grabbing'); };
  const onMouseMove = (event: MouseEvent) => {
    const [px, py] = localPos(event);
    if (dragging) {
      const dx = px - lastX, dy = py - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
      state.cx -= dx * state.sx; state.cy += (state.yDown ? -dy : dy) * state.sy;
      lastX = px; lastY = py; schedule(); return;
    }
    const hit = nearest(px, py, 12);
    const changed = Boolean(hit && (!state.hover || state.hover.index !== hit.index || state.hover.series !== hit.series)) || Boolean(!hit && state.hover);
    state.hover = hit; if (changed) schedule(); hoverListener?.(hit, px, py);
  };
  const onMouseLeave = () => { if (state.hover) { state.hover = null; schedule(); } hoverListener?.(null); };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const [px, py] = localPos(event); const factor = Math.exp((event.deltaY > 0 ? 1 : -1) * 0.12);
    const wx = xOfS(px), wy = yOfS(py); state.sx *= factor; state.sy *= factor;
    state.cx = wx - (px - midX()) * state.sx;
    state.cy = state.yDown ? wy - (py - midY()) * state.sy : wy + (py - midY()) * state.sy;
    schedule();
  };
  const onDoubleClick = () => fit();
  const onClick = (event: MouseEvent) => { if (dragMoved) return; const [px, py] = localPos(event); const hit = nearest(px, py, 14); if (hit) pickListener?.(hit); };
  const onTouchStart = (event: TouchEvent) => {
    if (!event.touches.length) return;
    event.preventDefault();
    const metric = touchMetrics(event.touches);
    touch = { mode: event.touches.length >= 2 ? 'pinch' : 'pan', ...metric, moved: false };
  };
  const onTouchMove = (event: TouchEvent) => {
    if (!touch || !event.touches.length) return;
    event.preventDefault();
    const metric = touchMetrics(event.touches);
    if (event.touches.length >= 2) {
      const wx = xOfS(touch.x), wy = yOfS(touch.y);
      if (metric.distance > 1 && touch.distance > 1) {
        const factor = touch.distance / metric.distance;
        state.sx *= factor; state.sy *= factor;
      }
      state.cx = wx - (metric.x - midX()) * state.sx;
      state.cy = state.yDown ? wy - (metric.y - midY()) * state.sy : wy + (metric.y - midY()) * state.sy;
      touch = { mode: 'pinch', ...metric, moved: true };
    } else {
      const dx = metric.x - touch.x, dy = metric.y - touch.y;
      const moved = touch.moved || Math.abs(dx) + Math.abs(dy) > 2;
      state.cx -= dx * state.sx; state.cy += (state.yDown ? -dy : dy) * state.sy;
      touch = { mode: 'pan', ...metric, moved };
    }
    schedule();
  };
  const onTouchEnd = (event: TouchEvent) => {
    event.preventDefault();
    if (event.touches.length) {
      const metric = touchMetrics(event.touches);
      touch = { mode: event.touches.length >= 2 ? 'pinch' : 'pan', ...metric, moved: true };
      return;
    }
    if (touch && !touch.moved) {
      const hit = nearest(touch.x, touch.y, 18);
      if (hit) pickListener?.(hit);
    }
    touch = null;
  };

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onWindowUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

  return {
    setSeries(series, keepView = false) { state.series = series || []; if (!keepView || !state.fitted) fit(); else schedule(); },
    setAxes(xLabel, yLabel) { state.xLabel = xLabel; state.yLabel = yLabel; schedule(); },
    setOptions(options) { Object.assign(state, options); schedule(); },
    setMarks(marks) { state.marks = marks || []; schedule(); },
    setSelected(selected) { state.selected = selected; schedule(); },
    setReferenceLines(lines) { state.referenceLines = lines || []; schedule(); },
    on(event, callback) {
      if (event === 'hover') hoverListener = callback as typeof hoverListener;
      else pickListener = callback as typeof pickListener;
    },
    reset: fit,
    redraw: schedule,
    resize() { if (resizeInternal()) schedule(); },
    series() { return state.series; },
    exportPNG(name) { return exportCanvasPNG(canvas, name); },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onWindowUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    },
  };
}
