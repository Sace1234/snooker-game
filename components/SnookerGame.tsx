'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { GameState } from '@/lib/types';
import { CAN_W, CAN_H, CW, MAX_SPEED, NUM_SUBSTEPS, POCKETS } from '@/lib/constants';
import { stepPhysics, allStopped } from '@/lib/physics';
import { createInitialState, resolveShot, isInD } from '@/lib/rules';
import { renderFrame } from '@/lib/renderer';

interface UISnap {
  player: number;
  scores: [number, number];
  ballOn: string;
  redsLeft: number;
  msg: string;
  foulMsg: string;
  phase: string;
  over: boolean;
  winner: number | null;
}

function snap(gs: GameState): UISnap {
  return {
    player: gs.player,
    scores: [...gs.scores] as [number, number],
    ballOn: gs.ballOn,
    redsLeft: gs.redsLeft,
    msg: gs.msg,
    foulMsg: gs.foulMsg,
    phase: gs.phase,
    over: gs.over,
    winner: gs.winner,
  };
}

const BALL_ON_LABEL: Record<string, string> = {
  red: 'Red', any_color: 'Any Colour', yellow: 'Yellow',
  green: 'Green', brown: 'Brown', blue: 'Blue', pink: 'Pink', black: 'Black',
};

const BALL_ON_COLOR: Record<string, string> = {
  red: '#E74C3C', any_color: '#aaa', yellow: '#F4D03F',
  green: '#2ECC71', brown: '#8B5E3C', blue: '#3498DB',
  pink: '#E91E8C', black: '#bbb',
};

// Desktop drag-to-shoot: full power at this many CSS pixels of drag
const MAX_DRAG_PX = 160;
// How many radians per 50ms interval tick for aim rotation buttons
const AIM_STEP = 0.018;
// Milliseconds to go from 0 → 100% power when holding the SHOOT button
const CHARGE_MS = 2200;

export default function SnookerGame() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gsRef        = useRef<GameState>(createInitialState());
  const rafRef       = useRef<number>(0);
  const scaleRef     = useRef(1);

  // Aim & shoot state (kept in refs to avoid re-render overhead)
  const aimRef          = useRef({ x: 150, y: 300 });
  const powerRef        = useRef(0);
  const isDraggingRef   = useRef(false);   // true while desktop drag or button charge active
  const dragStartRef    = useRef({ clientX: 0, clientY: 0 });
  const lockedAimRef    = useRef({ x: 150, y: 300 });

  // Zoom / pan — applied as CSS transform on the canvas element each frame
  const zoomRef = useRef(1);
  const panRef  = useRef({ x: 0, y: 0 }); // translate in container-px, origin = canvas top-left

  // Pinch-to-zoom tracking
  const pinchRef = useRef({
    active: false,
    startDist: 0,
    startZoom: 1,
    midX: 0, // midpoint in container px
    midY: 0,
  });

  // Single-finger pan tracking
  const panDragRef = useRef({
    active: false,
    moved:  false,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Mobile aim-rotate button interval
  const aimIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mobile shoot-button charge interval
  const chargeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chargeStartRef    = useRef(0);

  const [ui, setUI]             = useState<UISnap>(() => snap(gsRef.current));
  const [power, setPowerState]  = useState(0);
  const [isCharging, setIsCharging] = useState(false);

  const syncUI = useCallback(() => setUI(snap(gsRef.current)), []);

  // ── Canvas sizing ─────────────────────────────────────────────────────────

  const setupCanvas = useCallback(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const cw  = container.clientWidth;
    const ch  = (CAN_H / CAN_W) * cw;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width  = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scaleRef.current = (cw / CAN_W) * dpr;
  }, []);

  useEffect(() => {
    setupCanvas();
    const ro = new ResizeObserver(setupCanvas);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [setupCanvas]);

  // ── Coordinate conversion ─────────────────────────────────────────────────
  // getBoundingClientRect() accounts for CSS transforms, so this works
  // correctly at any zoom level.
  const toVirtual = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const s = CAN_W / rect.width;
    return {
      x: (clientX - rect.left) * s - CW,
      y: (clientY - rect.top)  * s - CW,
    };
  }, []);

  // ── Zoom/pan helpers ─────────────────────────────────────────────────────

  const clampPan = useCallback(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const z   = zoomRef.current;
    const cw  = container.clientWidth;
    const ch  = container.clientHeight;
    const csW = parseFloat(canvas.style.width)  || cw;
    const csH = parseFloat(canvas.style.height) || ch;
    panRef.current.x = Math.min(0, Math.max(cw  - csW * z, panRef.current.x));
    panRef.current.y = Math.min(0, Math.max(ch  - csH * z, panRef.current.y));
  }, []);

  const applyTransform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = panRef.current;
    const z = zoomRef.current;
    canvas.style.transform       = `translate(${x}px,${y}px) scale(${z})`;
    canvas.style.transformOrigin = '0 0';
  }, []);

  // ── Shoot ─────────────────────────────────────────────────────────────────

  const shoot = useCallback((shotPower: number) => {
    const gs = gsRef.current;
    if (gs.phase !== 'aiming') return;
    const cue = gs.balls.find(b => b.id === 'cue');
    if (!cue || cue.potted) return;

    const aim  = lockedAimRef.current;
    const dx   = aim.x - cue.x;
    const dy   = aim.y - cue.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const speed = (Math.max(1, shotPower) / 100) * MAX_SPEED;
    cue.vx = (dx / dist) * speed;
    cue.vy = (dy / dist) * speed;

    gs.phase          = 'rolling';
    gs.firstContact   = null;
    gs.pottedThisShot = [];
    gs.foulMsg        = '';
    powerRef.current  = 0;
    setPowerState(0);
    setIsCharging(false);
    isDraggingRef.current = false;
  }, []);

  // ── Game loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const tick = () => {
      const gs     = gsRef.current;
      const canvas = canvasRef.current;
      const ctx    = canvas?.getContext('2d');

      if (gs.phase === 'rolling' && ctx) {
        for (let step = 0; step < NUM_SUBSTEPS; step++) {
          const { collisions, potted } = stepPhysics(gs.balls, POCKETS);
          if (!gs.firstContact) {
            for (const ev of collisions) {
              if (ev.a === 'cue') { gs.firstContact = ev.b; break; }
              if (ev.b === 'cue') { gs.firstContact = ev.a; break; }
            }
          }
          for (const id of potted) {
            if (!gs.pottedThisShot.includes(id)) gs.pottedThisShot.push(id);
          }
        }
        if (allStopped(gs.balls)) {
          resolveShot(gs);
          syncUI();
        }
      }

      if (ctx) {
        const displayAim = isDraggingRef.current ? lockedAimRef.current : aimRef.current;
        const valid =
          gs.phase === 'placing' &&
          isInD(displayAim.x, displayAim.y) &&
          !gs.balls.some(
            b => !b.potted && b.id !== 'cue' &&
              Math.hypot(b.x - displayAim.x, b.y - displayAim.y) < b.radius * 2,
          );
        renderFrame(
          ctx, gs, displayAim.x, displayAim.y,
          powerRef.current, scaleRef.current,
          valid, isDraggingRef.current,
        );
        applyTransform();
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [syncUI, applyTransform]);

  // ── Global mouse tracking (keeps desktop drag-to-shoot working) ───────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const { x, y } = toVirtual(e.clientX, e.clientY);
      if (!isDraggingRef.current) {
        aimRef.current = { x, y };
      } else {
        const dist = Math.hypot(
          e.clientX - dragStartRef.current.clientX,
          e.clientY - dragStartRef.current.clientY,
        );
        const p = Math.min(100, (dist / MAX_DRAG_PX) * 100);
        powerRef.current = p;
        setPowerState(Math.round(p));
      }
    };
    const onUp = () => {
      if (isDraggingRef.current) {
        const p = powerRef.current;
        isDraggingRef.current = false;
        setIsCharging(false);
        if (p > 1) shoot(p);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [toVirtual, shoot]);

  // ── Desktop mouse handlers ────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const gs = gsRef.current;
    if (gs.phase === 'aiming') {
      lockedAimRef.current  = { ...aimRef.current };
      dragStartRef.current  = { clientX: e.clientX, clientY: e.clientY };
      isDraggingRef.current = true;
      powerRef.current      = 0;
      setPowerState(0);
      setIsCharging(true);
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const gs = gsRef.current;
    const { x, y } = toVirtual(e.clientX, e.clientY);
    if (gs.phase === 'placing') {
      if (!isInD(x, y)) return;
      const overlap = gs.balls.some(
        b => !b.potted && b.id !== 'cue' && Math.hypot(b.x - x, b.y - y) < b.radius * 2,
      );
      if (overlap) return;
      const cue = gs.balls.find(b => b.id === 'cue');
      if (!cue) return;
      cue.x = x; cue.y = y; cue.potted = false; cue.vx = 0; cue.vy = 0;
      aimRef.current = { x: x + 200, y };
      gs.phase = 'aiming';
      gs.msg   = `Player ${gs.player + 1} — aim and shoot`;
      syncUI();
    }
  }, [toVirtual, syncUI]);

  // ── Touch handlers — canvas is zoom/pan only ──────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length >= 2) {
      // Two fingers → start pinch
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      const midClientX = (t0.clientX + t1.clientX) / 2;
      const midClientY = (t0.clientY + t1.clientY) / 2;
      pinchRef.current = {
        active:    true,
        startDist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        startZoom: zoomRef.current,
        midX: rect ? midClientX - rect.left : midClientX,
        midY: rect ? midClientY - rect.top  : midClientY,
      };
      panDragRef.current.active = false;
      return;
    }

    // One finger
    pinchRef.current.active = false;
    const t = e.touches[0];
    panDragRef.current = {
      active:       true,
      moved:        false,
      startClientX: t.clientX,
      startClientY: t.clientY,
      startPanX:    panRef.current.x,
      startPanY:    panRef.current.y,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length >= 2 && pinchRef.current.active) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const rawZoom = pinchRef.current.startZoom * (newDist / pinchRef.current.startDist);
      const newZoom = Math.min(4, Math.max(1, rawZoom));
      const ratio   = newZoom / zoomRef.current;
      const { midX, midY } = pinchRef.current;
      panRef.current = {
        x: midX - (midX - panRef.current.x) * ratio,
        y: midY - (midY - panRef.current.y) * ratio,
      };
      zoomRef.current = newZoom;
      clampPan();
      return;
    }

    if (panDragRef.current.active && e.touches.length === 1) {
      const t  = e.touches[0];
      const dx = t.clientX - panDragRef.current.startClientX;
      const dy = t.clientY - panDragRef.current.startClientY;
      if (Math.hypot(dx, dy) > 6) panDragRef.current.moved = true;
      if (panDragRef.current.moved && zoomRef.current > 1) {
        panRef.current = {
          x: panDragRef.current.startPanX + dx,
          y: panDragRef.current.startPanY + dy,
        };
        clampPan();
      }
    }
  }, [clampPan]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length > 0) {
      // Still some fingers down — transition pinch → pan
      pinchRef.current.active = false;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        panDragRef.current = {
          active: true, moved: false,
          startClientX: t.clientX, startClientY: t.clientY,
          startPanX: panRef.current.x, startPanY: panRef.current.y,
        };
      }
      return;
    }

    pinchRef.current.active = false;

    // Short tap (no movement) in placing mode → place ball
    const drag = panDragRef.current;
    const gs   = gsRef.current;
    if (!drag.moved && gs.phase === 'placing') {
      const { x, y } = toVirtual(drag.startClientX, drag.startClientY);
      if (isInD(x, y)) {
        const overlap = gs.balls.some(
          b => !b.potted && b.id !== 'cue' && Math.hypot(b.x - x, b.y - y) < b.radius * 2,
        );
        if (!overlap) {
          const cue = gs.balls.find(b => b.id === 'cue');
          if (cue) {
            cue.x = x; cue.y = y; cue.potted = false; cue.vx = 0; cue.vy = 0;
            aimRef.current = { x: x + 200, y };
            gs.phase = 'aiming';
            gs.msg   = `Player ${gs.player + 1} — aim and shoot`;
            syncUI();
          }
        }
      }
    }
    panDragRef.current.active = false;
  }, [toVirtual, syncUI]);

  // ── Aim rotation buttons ──────────────────────────────────────────────────

  const rotateAim = useCallback((delta: number) => {
    const gs = gsRef.current;
    if (gs.phase !== 'aiming') return;
    const cue = gs.balls.find(b => b.id === 'cue');
    if (!cue) return;
    const aim   = aimRef.current;
    const dx    = aim.x - cue.x;
    const dy    = aim.y - cue.y;
    const angle = Math.atan2(dy, dx) + delta;
    const dist  = Math.max(Math.hypot(dx, dy), 80);
    aimRef.current = {
      x: cue.x + Math.cos(angle) * dist,
      y: cue.y + Math.sin(angle) * dist,
    };
  }, []);

  const startAimRotate = useCallback((dir: -1 | 1) => {
    if (aimIntervalRef.current) return;
    rotateAim(dir * AIM_STEP);
    aimIntervalRef.current = setInterval(() => rotateAim(dir * AIM_STEP), 50);
  }, [rotateAim]);

  const stopAimRotate = useCallback(() => {
    if (aimIntervalRef.current) {
      clearInterval(aimIntervalRef.current);
      aimIntervalRef.current = null;
    }
  }, []);

  // ── Shoot button (mobile charge-to-shoot) ─────────────────────────────────

  const startShootCharge = useCallback(() => {
    const gs = gsRef.current;
    if (gs.phase !== 'aiming') return;
    if (chargeIntervalRef.current) return;
    lockedAimRef.current  = { ...aimRef.current };
    isDraggingRef.current = true;
    powerRef.current      = 0;
    setPowerState(0);
    setIsCharging(true);
    chargeStartRef.current = Date.now();
    chargeIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - chargeStartRef.current;
      const p = Math.min(100, (elapsed / CHARGE_MS) * 100);
      powerRef.current = p;
      setPowerState(Math.round(p));
    }, 16);
  }, []);

  const releaseShoot = useCallback(() => {
    if (chargeIntervalRef.current) {
      clearInterval(chargeIntervalRef.current);
      chargeIntervalRef.current = null;
    }
    if (!isDraggingRef.current) return;
    const p = powerRef.current;
    isDraggingRef.current = false;
    setIsCharging(false);
    if (p > 1) shoot(p);
  }, [shoot]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => () => {
    if (aimIntervalRef.current)    clearInterval(aimIntervalRef.current);
    if (chargeIntervalRef.current) clearInterval(chargeIntervalRef.current);
  }, []);

  const newFrame = useCallback(() => {
    gsRef.current         = createInitialState();
    powerRef.current      = 0;
    isDraggingRef.current = false;
    zoomRef.current       = 1;
    panRef.current        = { x: 0, y: 0 };
    setPowerState(0);
    setIsCharging(false);
    syncUI();
  }, [syncUI]);

  // ── UI ────────────────────────────────────────────────────────────────────

  const p1Active  = ui.player === 0 && !ui.over;
  const p2Active  = ui.player === 1 && !ui.over;
  const ballColor = BALL_ON_COLOR[ui.ballOn] ?? '#fff';
  const isAiming  = ui.phase === 'aiming';

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-white select-none overflow-hidden">

      {/* ── Scoreboard ──────────────────────────────────────────────────── */}
      <div className="flex-none flex items-stretch bg-[#0D0D0D] border-b-2 border-[#1A1A1A]">

        {/* Player 1 */}
        <div className={`flex-1 flex items-center gap-3 px-4 py-2 transition-all
          ${p1Active ? 'bg-[#0F2A16] border-r-2 border-green-700' : 'border-r border-[#1A1A1A] opacity-60'}`}>
          <div className={`w-3 h-3 rounded-full shrink-0 transition-all
            ${p1Active ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : 'bg-gray-700'}`} />
          <div>
            <div className="text-[10px] tracking-[0.25em] text-gray-500 uppercase font-medium">Player 1</div>
            <div className="text-4xl font-bold tabular-nums leading-none text-white">{ui.scores[0]}</div>
          </div>
          {p1Active && (
            <div className="ml-auto text-[10px] text-green-400 font-semibold tracking-wider uppercase">
              YOUR TURN
            </div>
          )}
        </div>

        {/* Centre */}
        <div className="flex-none flex flex-col items-center justify-center px-5 py-2 gap-1 border-x border-[#222]">
          <div className="text-[9px] tracking-[0.35em] text-gray-600 uppercase font-semibold">Snooker</div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full border"
              style={{
                color: ballColor,
                borderColor: `${ballColor}55`,
                background:  `${ballColor}15`,
              }}
            >
              {BALL_ON_LABEL[ui.ballOn] ?? ui.ballOn}
            </span>
          </div>
          <div className="text-[10px] text-gray-600">
            {ui.redsLeft > 0 ? `${ui.redsLeft} red${ui.redsLeft !== 1 ? 's' : ''}` : 'Colours'}
          </div>
        </div>

        {/* Player 2 */}
        <div className={`flex-1 flex items-center justify-end gap-3 px-4 py-2 transition-all
          ${p2Active ? 'bg-[#0F2A16] border-l-2 border-green-700' : 'border-l border-[#1A1A1A] opacity-60'}`}>
          {p2Active && (
            <div className="mr-auto text-[10px] text-green-400 font-semibold tracking-wider uppercase">
              YOUR TURN
            </div>
          )}
          <div className="text-right">
            <div className="text-[10px] tracking-[0.25em] text-gray-500 uppercase font-medium">Player 2</div>
            <div className="text-4xl font-bold tabular-nums leading-none text-white">{ui.scores[1]}</div>
          </div>
          <div className={`w-3 h-3 rounded-full shrink-0 transition-all
            ${p2Active ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : 'bg-gray-700'}`} />
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      {/* overflow-hidden clips the scaled canvas; relative so absolute children work */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden relative bg-[#060606]">
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 touch-none cursor-crosshair"
          style={{ display: 'block' }}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {/* ── Controls bar ────────────────────────────────────────────────── */}
      <div className="flex-none px-3 py-2 bg-[#0D0D0D] border-t-2 border-[#1A1A1A]">

        {/* Status / foul */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs min-h-[16px]">
            {ui.foulMsg
              ? <span className="text-red-400 font-semibold">{ui.foulMsg}</span>
              : <span className="text-gray-400">{ui.msg}</span>
            }
          </div>
          {ui.over && (
            <span className="text-sm font-bold text-yellow-400">
              {ui.winner !== null ? `🏆 Player ${ui.winner + 1} wins!` : 'Draw!'}
            </span>
          )}
        </div>

        {/* Aim controls + power bar + shoot button */}
        <div className="flex items-center gap-2">

          {/* Aim rotate buttons (always visible in aiming phase) */}
          {isAiming && (
            <div className="flex gap-1 shrink-0">
              <button
                className="w-12 h-12 rounded-xl bg-[#1A2A1A] border border-green-900 text-green-400 text-lg font-bold active:bg-[#243A24] select-none"
                onPointerDown={() => startAimRotate(-1)}
                onPointerUp={stopAimRotate}
                onPointerLeave={stopAimRotate}
                onPointerCancel={stopAimRotate}
              >◄</button>
              <button
                className="w-12 h-12 rounded-xl bg-[#1A2A1A] border border-green-900 text-green-400 text-lg font-bold active:bg-[#243A24] select-none"
                onPointerDown={() => startAimRotate(1)}
                onPointerUp={stopAimRotate}
                onPointerLeave={stopAimRotate}
                onPointerCancel={stopAimRotate}
              >►</button>
            </div>
          )}

          {/* Power bar */}
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider w-10 shrink-0">Power</span>
            <div className="flex-1 h-2 rounded-full bg-[#1A1A1A] overflow-hidden">
              <div
                className="h-full rounded-full transition-none"
                style={{
                  width: `${power}%`,
                  background: power < 40
                    ? '#22c55e'
                    : power < 70
                    ? '#eab308'
                    : '#ef4444',
                }}
              />
            </div>
            <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{power}%</span>
          </div>

          {/* Shoot button */}
          {isAiming && (
            <button
              className={`w-16 h-12 rounded-xl border font-bold text-sm shrink-0 select-none transition-colors
                ${isCharging
                  ? 'bg-red-900 border-red-500 text-red-200 shadow-[0_0_14px_#ef444488]'
                  : 'bg-[#1A1A1A] border-[#333] text-gray-200 active:bg-[#2A2A2A]'
                }`}
              onPointerDown={startShootCharge}
              onPointerUp={releaseShoot}
              onPointerLeave={releaseShoot}
              onPointerCancel={releaseShoot}
            >
              {isCharging ? '●' : 'SHOOT'}
            </button>
          )}

          {/* New Frame button when not aiming */}
          {!isAiming && (
            <button
              onClick={newFrame}
              className="px-3 py-1 text-xs font-semibold rounded bg-[#1A1A1A] hover:bg-[#2A2A2A] transition-colors border border-[#2A2A2A] text-gray-300 shrink-0"
            >
              New Frame
            </button>
          )}
        </div>

        {/* Hint row */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="text-[10px] text-gray-700 leading-none">
            {ui.phase === 'placing' && 'Tap inside the D to place the cue ball · Pinch to zoom'}
            {ui.phase === 'aiming'  && 'Pinch/drag to zoom & pan · ◄► to aim · Hold SHOOT to charge'}
            {ui.phase === 'rolling' && 'Balls in motion…'}
            {ui.phase === 'over'    && 'Frame over'}
          </div>
          {isAiming && (
            <button
              onClick={newFrame}
              className="px-2 py-0.5 text-[10px] rounded bg-[#1A1A1A] hover:bg-[#2A2A2A] transition-colors border border-[#2A2A2A] text-gray-500 shrink-0"
            >
              New Frame
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
