// Synthesised snooker SFX via Web Audio API — no external files needed.

let _ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  } catch {
    return null;
  }
}

/** Filtered noise burst — the core primitive for all snooker clicks. */
function noiseBurst(
  freq: number,
  q: number,
  duration: number,
  gain: number,
  delayS = 0,
): void {
  const ctx = ac();
  if (!ctx) return;
  const t = ctx.currentTime + delayS;

  const len  = Math.ceil(ctx.sampleRate * duration);
  const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src    = ctx.createBufferSource();
  src.buffer   = buf;

  const filt        = ctx.createBiquadFilter();
  filt.type         = 'bandpass';
  filt.frequency.value = freq;
  filt.Q.value      = q;

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + duration);

  src.connect(filt);
  filt.connect(env);
  env.connect(ctx.destination);
  src.start(t);
  src.stop(t + duration);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Player fires the cue — sharp transient crack. */
export function playCueStrike(power: number): void {
  const g = 0.25 + Math.min(1, power) * 0.6;
  noiseBurst(3800, 1.2, 0.035, g);
}

/** Ball-ball collision — short hard click scaled by impact speed. */
export function playBallHit(speed: number): void {
  const intensity = Math.min(1, speed / 18);
  if (intensity < 0.06) return;
  noiseBurst(2400, 2.0, 0.04, 0.12 + intensity * 0.3);
}

/** Ball drops into pocket — hollow thud + descending rattle. */
export function playPotted(): void {
  const ctx = ac();
  if (!ctx) return;

  // Initial thud
  noiseBurst(320, 0.9, 0.13, 0.45);

  // Descending rattle (ball rolling to rest inside pocket)
  const t   = ctx.currentTime + 0.02;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.32);
  g.gain.setValueAtTime(0.07, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.start(t);
  osc.stop(t + 0.32);
}

/** Ball rebounds off a cushion. */
export function playCushionHit(speed: number): void {
  const intensity = Math.min(1, speed / 15);
  if (intensity < 0.08) return;
  noiseBurst(750, 1.1, 0.07, 0.1 + intensity * 0.22);
}
