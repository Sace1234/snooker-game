import type { Ball } from './types';
import { TW, TH, FRICTION, MIN_V, RESTITUTION_C, RESTITUTION_B } from './constants';

export interface CollisionEvent {
  a: string;
  b: string;
  speed: number; // relative speed along normal at impact
}

export interface StepResult {
  collisions: CollisionEvent[];
  potted: string[];
}

export function stepPhysics(
  balls: Ball[],
  pockets: { x: number; y: number; r: number }[],
): StepResult {
  const collisions: CollisionEvent[] = [];
  const potted: string[] = [];
  const active = balls.filter(b => !b.potted);

  // ── 1. Move + friction ────────────────────────────────────────────────────
  for (const b of active) {
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    if (Math.hypot(b.vx, b.vy) < MIN_V) { b.vx = 0; b.vy = 0; }
  }

  // ── 2. Pocket detection — BEFORE cushion bounce ───────────────────────────
  // Balls must be checked here so a fast ball crossing the pocket zone isn't
  // bounced back by the cushion before we get a chance to pot it.
  for (const b of active) {
    if (b.potted) continue;
    for (const p of pockets) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (dx * dx + dy * dy < p.r * p.r) {
        b.potted = true;
        b.vx = 0;
        b.vy = 0;
        potted.push(b.id);
        break;
      }
    }
  }

  // ── 3. Cushion bounce (skip potted balls) ─────────────────────────────────
  for (const b of active) {
    if (b.potted) continue;
    if (b.x - b.radius < 0) {
      b.x = b.radius;
      b.vx = Math.abs(b.vx) * RESTITUTION_C;
    } else if (b.x + b.radius > TW) {
      b.x = TW - b.radius;
      b.vx = -Math.abs(b.vx) * RESTITUTION_C;
    }
    if (b.y - b.radius < 0) {
      b.y = b.radius;
      b.vy = Math.abs(b.vy) * RESTITUTION_C;
    } else if (b.y + b.radius > TH) {
      b.y = TH - b.radius;
      b.vy = -Math.abs(b.vy) * RESTITUTION_C;
    }
  }

  // ── 4. Ball-ball collisions ───────────────────────────────────────────────
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if (a.potted || b.potted) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = a.radius + b.radius;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;

      const overlap = (minDist - dist) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const dvx = a.vx - b.vx;
      const dvy = a.vy - b.vy;
      const dot = dvx * nx + dvy * ny;
      if (dot > 0) {
        const imp = dot * (1 + RESTITUTION_B) / 2;
        a.vx -= imp * nx;
        a.vy -= imp * ny;
        b.vx += imp * nx;
        b.vy += imp * ny;
      }

      collisions.push({ a: a.id, b: b.id, speed: Math.max(0, dot) });
    }
  }

  return { collisions, potted };
}

export function allStopped(balls: Ball[]): boolean {
  return balls.every(b => b.potted || (b.vx === 0 && b.vy === 0));
}
