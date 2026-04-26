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

// Power increases over this CSS-pixel drag distance
const MAX_DRAG_PX = 160;

export default function SnookerGame() {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const gsRef          = useRef<GameState>(createInitialState());
  const rafRef         = useRef<number>(0);
  const scaleRef       = useRef(1);
  // Aim position in table-area coords (origin = top-left of felt)
  const aimRef         = useRef({ x: 150, y: 300 });
  const powerRef       = useRef(0);
  // Drag-to-shoot state
  const isDraggingRef  = useRef(false);
  const dragStartRef   = useRef({ clientX: 0, clientY: 0 });
  const lockedAimRef   = useRef({ x: 150, y: 300 });

  // Touch-specific: hold timer fires after 150ms to enter charge mode
  const holdTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chargeAnchorRef = useRef({ clientX: 0, clientY: 0 });
  const touchPosRef     = useRef({ clientX: 0, clientY: 0 });

  const [ui, setUI] = useState<UISnap>(() => snap(gsRef.current));
  const [power, setPowerState] = useState(0);
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
        // Aim uses locked direction while dragging, free otherwise
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
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [syncUI]);

  // ── Global mouse tracking (window-level so aim works outside canvas) ────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Always update free aim
      const { x, y } = toVirtual(e.clientX, e.clientY);
      if (!isDraggingRef.current) {
        aimRef.current = { x, y };
      } else {
        // While dragging: update power from drag distance only
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
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [toVirtual, shoot]);

  // ── Touch handlers ────────────────────────────────────────────────────────
  // Two-phase touch: tap/slide freely aims the line (no shot), holding still
  // for 150 ms locks the aim and enters charge mode — drag distance = power,
  // lift = shoot.

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    const { x, y } = toVirtual(t.clientX, t.clientY);

    // Always update free aim immediately
    aimRef.current = { x, y };
    touchPosRef.current = { clientX: t.clientX, clientY: t.clientY };

    // Clear any in-progress charge
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    isDraggingRef.current = false;
    setIsCharging(false);
    powerRef.current = 0;

    const gs = gsRef.current;
    if (gs.phase === 'aiming') {
      // After 150 ms of holding, lock aim and enter charge mode
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        lockedAimRef.current = { ...aimRef.current };
        chargeAnchorRef.current = { ...touchPosRef.current };
        isDraggingRef.current = true;
        powerRef.current = 0;
        setPowerState(0);
        setIsCharging(true);
      }, 150);
    }
  }, [toVirtual]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    touchPosRef.current = { clientX: t.clientX, clientY: t.clientY };

    if (!isDraggingRef.current) {
      // Free-aim phase: aim line follows finger
      const { x, y } = toVirtual(t.clientX, t.clientY);
      aimRef.current = { x, y };
    } else {
      // Charge phase: drag distance from anchor = power
      const dist = Math.hypot(
        t.clientX - chargeAnchorRef.current.clientX,
        t.clientY - chargeAnchorRef.current.clientY,
      );
      const p = Math.min(100, (dist / MAX_DRAG_PX) * 100);
      powerRef.current = p;
      setPowerState(Math.round(p));
    }
  }, [toVirtual]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    // Always cancel any pending hold timer
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }

    const gs = gsRef.current;

    if (isDraggingRef.current) {
      const p = powerRef.current;
      isDraggingRef.current = false;
      setIsCharging(false);
      if (p > 1) { shoot(p); return; }
    }

    // Short tap — handle placing mode
    if (gs.phase === 'placing') {
      const { x, y } = aimRef.current;
      if (!isInD(x, y)) return;
      const overlap = gs.balls.some(
        b => !b.potted && b.id !== 'cue' && Math.hypot(b.x - x, b.y - y) < b.radius * 2,
      );
      if (overlap) return;
      const cue = gs.balls.find(b => b.id === 'cue');
      if (!cue) return;
      cue.x = x; cue.y = y; cue.potted = false; cue.vx = 0; cue.vy = 0;
      gs.phase = 'aiming';
      gs.msg   = `Player ${gs.player + 1} — aim and shoot`;
      syncUI();
    }
  }, [shoot, syncUI]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const gs = gsRef.current;
    if (gs.phase === 'aiming') {
      lockedAimRef.current = { ...aimRef.current };
      dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
      isDraggingRef.current = true;
      powerRef.current = 0;
      setPowerState(0);
      setIsCharging(true);
    }
  }, []);

  // handleMouseUp is now on window — kept as no-op placeholder for canvas
  const handleMouseUp = useCallback(() => {}, []);

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
      gs.phase = 'aiming';
      gs.msg   = `Player ${gs.player + 1} — aim and shoot`;
      syncUI();
    }
  }, [toVirtual, syncUI]);

  // Clean up hold timer on unmount
  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  const newFrame = useCallback(() => {
    gsRef.current = createInitialState();
    powerRef.current = 0;
    isDraggingRef.current = false;
    setPowerState(0);
    setIsCharging(false);
    syncUI();
  }, [syncUI]);

  // ── UI ────────────────────────────────────────────────────────────────────

  const p1Active = ui.player === 0 && !ui.over;
  const p2Active = ui.player === 1 && !ui.over;
  const ballColor = BALL_ON_COLOR[ui.ballOn] ?? '#fff';

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-white select-none overflow-hidden">

      {/* ── Scoreboard ────────────────────────────────────────────────────── */}
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
                background: `${ballColor}15`,
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

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0 flex items-center justify-center bg-[#060606] p-1">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full touch-none cursor-crosshair"
          style={{ display: 'block' }}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div className="flex-none px-4 py-2 bg-[#0D0D0D] border-t-2 border-[#1A1A1A]">

        {/* Status / foul */}
        <div className="flex items-center justify-between mb-1.5">
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

        {/* Power indicator + buttons */}
        <div className="flex items-center gap-3">
          {/* Power bar (read-only, driven by drag) */}
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

          <button
            onClick={newFrame}
            className="px-3 py-1 text-xs font-semibold rounded bg-[#1A1A1A] hover:bg-[#2A2A2A] transition-colors border border-[#2A2A2A] text-gray-300 shrink-0"
          >
            New Frame
          </button>
        </div>

        {/* Hint */}
        <div className="mt-1 text-[10px] text-gray-700 leading-none">
          {ui.phase === 'placing' && 'Click inside the D to place the cue ball'}
          {ui.phase === 'aiming'  && 'Aim with mouse/tap · Hold 150ms to lock & charge · Release to shoot'}
          {ui.phase === 'rolling' && 'Balls in motion…'}
          {ui.phase === 'over'    && 'Frame over · Click New Frame to play again'}
        </div>
      </div>
    </div>
  );
}
