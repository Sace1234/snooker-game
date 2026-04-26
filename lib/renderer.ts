import type { Ball, GameState } from './types';
import {
  TW, TH, CW, CAN_W, CAN_H,
  BAULK_X, D_RAD, SPOTS, POCKETS,
} from './constants';

// ── Colour helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v =>
    Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0'),
  ).join('');
}
function lighten(hex: string, amt: number) { const [r,g,b]=hexToRgb(hex); return toHex(r+amt,g+amt,b+amt); }
function darken (hex: string, amt: number) { const [r,g,b]=hexToRgb(hex); return toHex(r-amt,g-amt,b-amt); }

// ── Pocket helpers ────────────────────────────────────────────────────────────

// Visual pocket radius for each pocket index (0-5)
function pocketVisRadius(idx: number): number {
  return (idx === 1 || idx === 4) ? 26 : 30; // middle : corner
}

// ── Table drawing ─────────────────────────────────────────────────────────────

function drawTable(ctx: CanvasRenderingContext2D): void {
  // ── Wood frame ────────────────────────────────────────────────────────────
  ctx.fillStyle = '#2C1A0E';
  ctx.fillRect(0, 0, CAN_W, CAN_H);

  const woodGrad = ctx.createLinearGradient(0, 0, CAN_W, CAN_H);
  woodGrad.addColorStop(0, 'rgba(100,55,15,0.4)');
  woodGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  woodGrad.addColorStop(1, 'rgba(100,55,15,0.4)');
  ctx.fillStyle = woodGrad;
  ctx.fillRect(0, 0, CAN_W, CAN_H);

  // ── Felt surface (drawn first, pockets overdraw on top) ───────────────────
  const feltGrad = ctx.createRadialGradient(
    CW + TW / 2, CW + TH / 2, 60,
    CW + TW / 2, CW + TH / 2, Math.hypot(TW, TH) * 0.55,
  );
  feltGrad.addColorStop(0, '#1E7038');
  feltGrad.addColorStop(1, '#155A2A');
  ctx.fillStyle = feltGrad;
  ctx.fillRect(CW, CW, TW, TH);

  // ── Pockets — drawn ON TOP of felt so they appear as dark holes ───────────
  for (let i = 0; i < POCKETS.length; i++) {
    const p = POCKETS[i];
    const vis = pocketVisRadius(i);
    const cx = CW + p.x;
    const cy = CW + p.y;

    // Outer brass/gold rim
    ctx.beginPath();
    ctx.arc(cx, cy, vis + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#7A5A20';
    ctx.fill();

    // Dark hole
    ctx.beginPath();
    ctx.arc(cx, cy, vis, 0, Math.PI * 2);
    const pocketGrad = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, vis);
    pocketGrad.addColorStop(0, '#111111');
    pocketGrad.addColorStop(1, '#020202');
    ctx.fillStyle = pocketGrad;
    ctx.fill();
  }

  // ── Table markings ────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(CW, CW);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5;

  // Baulk line
  ctx.beginPath();
  ctx.moveTo(BAULK_X, 0);
  ctx.lineTo(BAULK_X, TH);
  ctx.stroke();

  // D semicircle (opens toward baulk cushion = left)
  ctx.beginPath();
  ctx.arc(BAULK_X, TH / 2, D_RAD, Math.PI / 2, 3 * Math.PI / 2);
  ctx.stroke();

  // Colour spots
  for (const pos of Object.values(SPOTS)) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
  }

  ctx.restore();
}

// ── Ball drawing ─────────────────────────────────────────────────────────────

function drawBall(ctx: CanvasRenderingContext2D, ball: Ball): void {
  if (ball.potted) return;
  const { x, y, radius, fill, stroke } = ball;
  const cx = CW + x;
  const cy = CW + y;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;

  const grad = ctx.createRadialGradient(
    cx - radius * 0.33, cy - radius * 0.33, radius * 0.05,
    cx, cy, radius,
  );
  grad.addColorStop(0, lighten(fill, 55));
  grad.addColorStop(0.5, fill);
  grad.addColorStop(1, darken(fill, 45));

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const hl = ctx.createRadialGradient(
    cx - radius * 0.38, cy - radius * 0.38, 0,
    cx - radius * 0.38, cy - radius * 0.38, radius * 0.52,
  );
  hl.addColorStop(0, 'rgba(255,255,255,0.55)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = hl;
  ctx.fill();
}

// ── Aim / cue / power ────────────────────────────────────────────────────────

function drawPowerArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  power: number,
): void {
  if (power <= 0.5) return;
  const frac = power / 100;
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + frac * 2 * Math.PI;

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 9, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Power fill — green → yellow → red
  const r = Math.round(frac < 0.5 ? frac * 2 * 200 : 200);
  const g = Math.round(frac < 0.5 ? 220 : (1 - frac) * 2 * 220);
  const powerColor = `rgb(${r},${g},40)`;

  ctx.beginPath();
  ctx.arc(cx, cy, radius + 9, startAngle, endAngle);
  ctx.strokeStyle = powerColor;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  cueBall: Ball,
  aimX: number,
  aimY: number,
  power: number,
  isCharging: boolean,
): void {
  const cx = CW + cueBall.x;
  const cy = CW + cueBall.y;
  const mx = CW + aimX;
  const my = CW + aimY;
  const dx = cx - mx;
  const dy = cy - my;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const nx = dx / dist;
  const ny = dy / dist;

  // Aim line
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(cx - nx * cueBall.radius, cy - ny * cueBall.radius);
  ctx.lineTo(mx, my);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Power arc
  if (isCharging) drawPowerArc(ctx, cx, cy, cueBall.radius, power);

  // Cue stick — pulls back as power increases
  const gap = cueBall.radius + 3 + (power / 100) * 55;
  const tipX = cx + nx * gap;
  const tipY = cy + ny * gap;
  const buttX = tipX + nx * 210;
  const buttY = tipY + ny * 210;

  const cueGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
  cueGrad.addColorStop(0, '#E8D8B0');
  cueGrad.addColorStop(0.12, '#BF963A');
  cueGrad.addColorStop(1, '#3D1F08');

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(buttX, buttY);
  ctx.strokeStyle = cueGrad;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.stroke();
  // Ferrule
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(cx + nx * (cueBall.radius + 2), cy + ny * (cueBall.radius + 2));
  ctx.strokeStyle = '#EDE8DC';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawPlacing(
  ctx: CanvasRenderingContext2D,
  aimX: number,
  aimY: number,
  valid: boolean,
): void {
  const cx = CW + aimX;
  const cy = CW + aimY;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 16.5, 0, Math.PI * 2);
  ctx.strokeStyle = valid ? 'rgba(80,255,120,0.7)' : 'rgba(255,80,80,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (valid) {
    ctx.beginPath();
    ctx.arc(cx, cy, 16.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(80,255,120,0.08)';
    ctx.fill();
  }
  ctx.restore();
}

// ── Public render entry ───────────────────────────────────────────────────────

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  aimX: number,
  aimY: number,
  power: number,
  scale: number,
  placementValid: boolean,
  isCharging: boolean,
): void {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, CAN_W, CAN_H);

  drawTable(ctx);

  const sorted = [...state.balls].sort((a, b) => {
    const rank = (ball: Ball) => ball.type === 'cue' ? 2 : ball.type === 'color' ? 1 : 0;
    return rank(a) - rank(b);
  });
  for (const ball of sorted) drawBall(ctx, ball);

  if (state.phase === 'aiming') {
    const cue = state.balls.find(b => b.id === 'cue');
    if (cue && !cue.potted) drawAim(ctx, cue, aimX, aimY, power, isCharging);
  }

  if (state.phase === 'placing') {
    drawPlacing(ctx, aimX, aimY, placementValid);
  }

  ctx.restore();
}
