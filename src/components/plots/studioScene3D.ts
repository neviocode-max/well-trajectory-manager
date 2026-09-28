import { clamp, D2R } from '../../engine/constants';
import type { StudioApproach, StudioMark3D, StudioWell3D } from '../../types/studio';
import { fmt } from '../../utils/format';
import { exportCanvasPNG, themeColor } from './studioCanvas';

export interface Scene3DHit {
  well: StudioWell3D;
  index: number;
  x: number;
  y: number;
  z: number;
  color: string;
}

export interface Scene3DDisplayOptions {
  showStations?: boolean;
  showLabels?: boolean;
  showStationLabels?: boolean;
  showGrid?: boolean;
}

export interface Scene3DApi {
  on(event: 'hover', callback: ((hit: Scene3DHit | null, px?: number, py?: number) => void) | null): void;
  on(event: 'pick', callback: ((hit: Scene3DHit) => void) | null): void;
  setWells(wells: StudioWell3D[], keepCamera?: boolean): void;
  setOptions(options: Scene3DDisplayOptions): void;
  setZExag(value: number): void;
  setMarks(marks: StudioMark3D[]): void;
  setSelected(mark: StudioMark3D | null): void;
  setApproach(approach: StudioApproach | null): void;
  focusApproach(a: StudioMark3D, b: StudioMark3D): void;
  preset(name: 'top' | 'front' | 'side' | 'iso'): void;
  reset(): void;
  redraw(): void;
  resize(): void;
  wells(): StudioWell3D[];
  exportPNG(name: string): Promise<boolean>;
  destroy(): void;
}

export function createScene3D(canvas: HTMLCanvasElement): Scene3DApi {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  const ctx: CanvasRenderingContext2D = context;

  const cam = { az: 200, el: 26, dist: 1000, target: [0, 0, 0] as [number, number, number], zExag: 1, fov: 45 };
  const state: {
    wells: StudioWell3D[];
    showStations: boolean;
    showLabels: boolean;
    showStationLabels: boolean;
    showGrid: boolean;
    hover: Scene3DHit | null;
    selected: StudioMark3D | null;
    marks: StudioMark3D[];
    approach: StudioApproach | null;
    dpr: number; w: number; h: number; extent: number;
    center: [number, number, number];
    bounds?: { x0:number;x1:number;y0:number;y1:number;z0:number;z1:number };
  } = {
    wells: [], showStations: false, showLabels: true, showStationLabels: false, showGrid: true,
    hover: null, selected: null, marks: [], approach: null,
    dpr: 1, w: 0, h: 0, extent: 1000, center: [0, 0, 0],
  };

  let raf = 0;
  let drag: { x: number; y: number; moved: boolean; pan: boolean } | null = null;
  let hoverListener: ((hit: Scene3DHit | null, px?: number, py?: number) => void) | null = null;
  let pickListener: ((hit: Scene3DHit) => void) | null = null;

  function resizeInternal(): boolean {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(50, Math.round(rect.width));
    const h = Math.max(50, Math.round(rect.height));
    if (state.w === w && state.h === h && state.dpr === dpr) return false;
    state.w = w; state.h = h; state.dpr = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    return true;
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v: number[]) => { const length = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / length, v[1] / length, v[2] / length]; };
  function basis() {
    const a = cam.az * D2R, e = cam.el * D2R;
    const dir = [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
    const eye = [cam.target[0] + dir[0] * cam.dist, cam.target[1] + dir[1] * cam.dist, cam.target[2] + dir[2] * cam.dist];
    const fwd = norm([-dir[0], -dir[1], -dir[2]]);
    const right = norm([-Math.cos(a), Math.sin(a), 0]);
    const up = norm(cross(right, fwd));
    return { eye, fwd, right, up };
  }
  let cameraBasis = basis();
  let focal = 1;
  function updateCamera() {
    cameraBasis = basis();
    focal = (state.h / 2) / Math.tan(cam.fov / 2 * D2R);
  }
  function project(x: number, y: number, z: number): [number, number, number] | null {
    const zz = z * cam.zExag;
    const dx = x - cameraBasis.eye[0], dy = y - cameraBasis.eye[1], dz = zz - cameraBasis.eye[2];
    const cz = dx * cameraBasis.fwd[0] + dy * cameraBasis.fwd[1] + dz * cameraBasis.fwd[2];
    if (cz <= 1e-6) return null;
    const cxx = dx * cameraBasis.right[0] + dy * cameraBasis.right[1] + dz * cameraBasis.right[2];
    const cyy = dx * cameraBasis.up[0] + dy * cameraBasis.up[1] + dz * cameraBasis.up[2];
    const k = focal / cz;
    return [state.w / 2 + cxx * k, state.h / 2 - cyy * k, cz];
  }

  function frameAll() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const well of state.wells) {
      const b = well.buf;
      for (let i = 0; i < b.n; i++) {
        if (b.x[i] < x0) x0 = b.x[i]; if (b.x[i] > x1) x1 = b.x[i];
        if (b.y[i] < y0) y0 = b.y[i]; if (b.y[i] > y1) y1 = b.y[i];
        if (b.z[i] < z0) z0 = b.z[i]; if (b.z[i] > z1) z1 = b.z[i];
      }
    }
    if (!Number.isFinite(x0)) { x0 = -100; x1 = 100; y0 = -100; y1 = 100; z0 = 0; z1 = 100; }
    if (x1 - x0 < 1) { x0 -= 50; x1 += 50; }
    if (y1 - y0 < 1) { y0 -= 50; y1 += 50; }
    if (z1 - z0 < 1) { z0 -= 50; z1 += 50; }
    state.bounds = { x0, x1, y0, y1, z0, z1 };
    state.center = [(x0 + x1) / 2, (y0 + y1) / 2, ((z0 + z1) / 2) * cam.zExag];
    state.extent = Math.max(x1 - x0, y1 - y0, (z1 - z0) * cam.zExag, 50);
    cam.target = [...state.center] as [number, number, number];
    cam.dist = state.extent * 2.1;
    updateCamera(); schedule();
  }

  function setPreset(name: 'top' | 'front' | 'side' | 'iso') {
    if (name === 'top') { cam.az = 180; cam.el = 89.5; }
    else if (name === 'front') { cam.az = 180; cam.el = 0; }
    else if (name === 'side') { cam.az = 90; cam.el = 0; }
    else { cam.az = 200; cam.el = 26; }
    cam.target = [...state.center] as [number, number, number];
    cam.dist = state.extent * 2.1;
    updateCamera(); schedule();
  }

  function drawGrid() {
    if (!state.showGrid || !state.bounds) return;
    const b = state.bounds;
    const zBase = b.z0 - (b.z1 - b.z0) * 0.05;
    const stepRaw = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 6;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(stepRaw, 1))));
    const step = Math.max(pow, Math.round(stepRaw / pow) * pow);
    const gx0 = Math.floor(b.x0 / step) * step, gx1 = Math.ceil(b.x1 / step) * step;
    const gy0 = Math.floor(b.y0 / step) * step, gy1 = Math.ceil(b.y1 / step) * step;
    ctx.strokeStyle = themeColor('--grid'); ctx.lineWidth = 1; ctx.beginPath();
    for (let x = gx0; x <= gx1 + 1e-6; x += step) { const a = project(x, gy0, zBase), c = project(x, gy1, zBase); if (a && c) { ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); } }
    for (let y = gy0; y <= gy1 + 1e-6; y += step) { const a = project(gx0, y, zBase), c = project(gx1, y, zBase); if (a && c) { ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); } }
    ctx.stroke();

    const length = state.extent * 0.32;
    const origin = project(gx0, gy0, zBase);
    const axes: Array<[[number, number, number] | null, string, string]> = [
      [project(gx0 + length, gy0, zBase), 'E (X)', '#f87171'],
      [project(gx0, gy0 + length, zBase), 'N (Y)', '#34d399'],
      [project(gx0, gy0, zBase + length / cam.zExag), 'Z', '#60a5fa'],
    ];
    if (origin) {
      ctx.lineWidth = 2; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [point, label, color] of axes) {
        if (!point) continue;
        ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(origin[0], origin[1]); ctx.lineTo(point[0], point[1]); ctx.stroke();
        ctx.fillStyle = color; ctx.fillText(label, point[0] + 6, point[1] - 6);
      }
    }
  }

  function draw() {
    resizeInternal(); updateCamera();
    const dpr = state.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, state.w, state.h);
    drawGrid();
    const order = state.wells.map((well, index) => {
      const b = well.buf, middle = (b.n / 2) | 0; const p = project(b.x[middle], b.y[middle], b.z[middle]);
      return { index, depth: p ? p[2] : Infinity };
    }).sort((a, b) => b.depth - a.depth);
    const labels: Array<{label:string;x:number;y:number;color:string;primary:boolean}> = [];

    for (const item of order) {
      const well = state.wells[item.index], b = well.buf;
      const step = Math.max(1, Math.floor(b.n / (state.w * 1.5)));
      ctx.strokeStyle = well.color; ctx.lineWidth = well.primary ? 2.6 : 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      let started = false;
      for (let i = 0; i < b.n; i += step) {
        const p = project(b.x[i], b.y[i], b.z[i]);
        if (!p) { started = false; continue; }
        if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
      }
      const last = project(b.x[b.n - 1], b.y[b.n - 1], b.z[b.n - 1]);
      if (started && last) ctx.lineTo(last[0], last[1]);
      ctx.stroke();

      if (state.showStations) {
        ctx.fillStyle = well.color;
        const stationStep = Math.max(step, Math.ceil(b.n / 2500));
        for (let i = 0; i < b.n; i += stationStep) {
          const p = project(b.x[i], b.y[i], b.z[i]); if (!p) continue;
          ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, Math.PI * 2); ctx.fill();
          if (state.showStationLabels && b.n < 400) {
            ctx.fillStyle = themeColor('--muted'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(b.md[i], 0), p[0] + 5, p[1]); ctx.fillStyle = well.color;
          }
        }
      }
      const surface = project(b.x[0], b.y[0], b.z[0]);
      if (surface) {
        ctx.fillStyle = well.color; ctx.beginPath(); ctx.rect(surface[0] - 4, surface[1] - 4, 8, 8); ctx.fill();
        ctx.strokeStyle = themeColor('--text'); ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(surface[0] - 4.5, surface[1] - 4.5, 9, 9); ctx.stroke();
      }
      if (state.showLabels && last) labels.push({ label: well.label, x: last[0] + 7, y: last[1], color: well.color, primary: well.primary });
    }

    if (state.showLabels && labels.length) {
      const placed: Array<{l:number;r:number;t:number;b:number}> = [];
      const overlap = (a:{l:number;r:number;t:number;b:number}, b:{l:number;r:number;t:number;b:number}) => !(a.r < b.l || a.l > b.r || a.b < b.t || a.t > b.b);
      ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; labels.sort((a, b) => Number(b.primary) - Number(a.primary));
      for (const candidate of labels) {
        const width = ctx.measureText(candidate.label).width; const offsets = [0, -14, 14, -28, 28, -42, 42];
        let chosen: {x:number;y:number;box:{l:number;r:number;t:number;b:number}} | null = null;
        for (const dy of offsets) {
          const x = clamp(candidate.x, 4, state.w - width - 4), y = clamp(candidate.y + dy, 9, state.h - 9); const box = { l: x - 2, r: x + width + 2, t: y - 7, b: y + 7 };
          if (candidate.primary || !placed.some(item => overlap(box, item))) { chosen = { x, y, box }; break; }
        }
        if (!chosen) continue;
        ctx.fillStyle = themeColor('--text'); ctx.fillText(candidate.label, chosen.x, chosen.y); placed.push(chosen.box);
      }
    }

    if (state.approach) {
      const a = project(state.approach.a.x, state.approach.a.y, state.approach.a.z), b = project(state.approach.b.x, state.approach.b.y, state.approach.b.z);
      if (a && b) {
        ctx.save(); ctx.strokeStyle = themeColor('--warn'); ctx.fillStyle = themeColor('--warn'); ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fill(); }
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${fmt(state.approach.distance, 3)} m`, mx, my - 5); ctx.restore();
      }
    }

    for (const mark of state.marks) {
      const p = project(mark.x, mark.y, mark.z); if (!p) continue;
      ctx.strokeStyle = themeColor('--warn'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.stroke();
    }
    if (state.marks.length === 2) {
      const a = project(state.marks[0].x, state.marks[0].y, state.marks[0].z), b = project(state.marks[1].x, state.marks[1].y, state.marks[1].z);
      if (a && b) { ctx.setLineDash([6, 4]); ctx.strokeStyle = themeColor('--warn'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); }
    }
    if (state.selected) {
      const p = project(state.selected.x, state.selected.y, state.selected.z); if (p) { ctx.strokeStyle = themeColor('--text'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (state.hover) {
      const p = project(state.hover.x, state.hover.y, state.hover.z); if (p) { ctx.fillStyle = state.hover.color; ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function nearest(px: number, py: number, maxDist = 12): Scene3DHit | null {
    let best: Scene3DHit | null = null, bestD = maxDist * maxDist;
    for (const well of state.wells) {
      const b = well.buf, step = Math.max(1, Math.floor(b.n / 4000));
      for (let i = 0; i < b.n; i += step) {
        const p = project(b.x[i], b.y[i], b.z[i]); if (!p) continue;
        const dx = p[0] - px, dy = p[1] - py, distance = dx * dx + dy * dy;
        if (distance < bestD) { bestD = distance; best = { well, index: i, x: b.x[i], y: b.y[i], z: b.z[i], color: well.color }; }
      }
    }
    return best;
  }
  function localPos(event: MouseEvent | WheelEvent): [number, number] { const rect = canvas.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; }
  const onContext = (event: MouseEvent) => event.preventDefault();
  const onDown = (event: MouseEvent) => { const [x, y] = localPos(event); drag = { x, y, moved: false, pan: event.shiftKey || event.button === 1 || event.button === 2 }; canvas.classList.add('grabbing'); };
  const onWindowUp = () => { drag = null; canvas.classList.remove('grabbing'); };
  const onMove = (event: MouseEvent) => {
    const [px, py] = localPos(event);
    if (drag) {
      const dx = px - drag.x, dy = py - drag.y; if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      if (drag.pan) {
        const scale = cam.dist / focal;
        for (let i = 0; i < 3; i++) cam.target[i] -= (cameraBasis.right[i] * dx - cameraBasis.up[i] * dy) * scale;
      } else {
        cam.az = (cam.az - dx * 0.4) % 360; cam.el = clamp(cam.el + dy * 0.35, -89.5, 89.5);
      }
      drag.x = px; drag.y = py; updateCamera(); schedule(); return;
    }
    const hit = nearest(px, py, 11);
    const changed = Boolean(hit && (!state.hover || state.hover.index !== hit.index || state.hover.well !== hit.well)) || Boolean(!hit && state.hover);
    state.hover = hit; if (changed) schedule(); hoverListener?.(hit, px, py);
  };
  const onLeave = () => { if (state.hover) { state.hover = null; schedule(); } hoverListener?.(null); };
  const onWheel = (event: WheelEvent) => { event.preventDefault(); cam.dist = clamp(cam.dist * Math.exp((event.deltaY > 0 ? 1 : -1) * 0.11), state.extent * 0.02, state.extent * 40); updateCamera(); schedule(); };
  const onDouble = () => frameAll();
  const onClick = (event: MouseEvent) => { if (drag?.moved) return; const [px, py] = localPos(event); const hit = nearest(px, py, 13); if (hit) pickListener?.(hit); };

  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onWindowUp);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDouble);
  canvas.addEventListener('click', onClick);

  return {
    on(event, callback) { if (event === 'hover') hoverListener = callback as typeof hoverListener; else pickListener = callback as typeof pickListener; },
    setWells(wells, keepCamera = false) { const first = !state.bounds || !state.wells.length; state.wells = wells || []; if (!keepCamera || first) frameAll(); else { updateCamera(); schedule(); } },
    setOptions(options) { Object.assign(state, options); schedule(); },
    setZExag(value) { cam.zExag = value; frameAll(); },
    setMarks(marks) { state.marks = marks || []; schedule(); },
    setSelected(mark) { state.selected = mark; schedule(); },
    setApproach(approach) { state.approach = approach; schedule(); },
    focusApproach(a, b) {
      cam.az = 200; cam.el = 26;
      cam.target = [(a.x + b.x) / 2, (a.y + b.y) / 2, ((a.z + b.z) / 2) * cam.zExag];
      const sep = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const desired = Math.max(80, sep * 4, state.extent * 0.12);
      cam.dist = Math.min(desired, Math.max(120, state.extent * 0.72));
      updateCamera(); schedule();
    },
    preset: setPreset,
    reset: frameAll,
    redraw: schedule,
    resize() { if (resizeInternal()) { updateCamera(); schedule(); } },
    wells() { return state.wells; },
    exportPNG(name) { return exportCanvasPNG(canvas, name); },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onWindowUp);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDouble);
      canvas.removeEventListener('click', onClick);
    },
  };
}
