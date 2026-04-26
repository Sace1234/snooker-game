import type { Ball, BallOn, GameState, Phase } from './types';
import {
  BR, APEX_X, APEX_Y, SPOTS, BALL_PALETTE, COLOR_ORDER,
} from './constants';

// ── Ball factory ─────────────────────────────────────────────────────────────

function makeBall(
  id: string,
  x: number,
  y: number,
  type: Ball['type'],
  colorKey: string,
  points: number,
): Ball {
  const pal = BALL_PALETTE[colorKey];
  return {
    id, x, y, vx: 0, vy: 0,
    radius: BR,
    fill: pal.fill,
    stroke: pal.stroke,
    points,
    potted: false,
    type,
  };
}

export function buildInitialBalls(): Ball[] {
  const balls: Ball[] = [];

  // Cue ball – starts potted=false but will be placed in D (in hand)
  balls.push(makeBall('cue', 150, 300, 'cue', 'cue', 0));

  // Colours at their spots
  for (const [name, pos] of Object.entries(SPOTS)) {
    const pts: Record<string, number> = {
      yellow: 2, green: 3, brown: 4, blue: 5, pink: 6, black: 7,
    };
    balls.push(makeBall(name, pos.x, pos.y, 'color', name, pts[name]));
  }

  // 15 reds in triangle.
  // Apex (row 0, 1 ball) is nearest to pink — the LEFT side of the cluster.
  // Each subsequent row steps RIGHTWARD toward the black end.
  // Row r has (r+1) balls, symmetrically centred on APEX_Y.
  const rowSpacing = BR * Math.sqrt(3); // horizontal gap between adjacent rows
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    const count = row + 1;
    const rx = APEX_X + row * rowSpacing;        // expands toward black (right)
    const startY = APEX_Y - row * BR;            // topmost ball in this row
    for (let col = 0; col < count; col++) {
      balls.push(makeBall(
        `red${idx + 1}`,
        rx,
        startY + col * BR * 2,
        'red',
        'red',
        1,
      ));
      idx++;
    }
  }

  return balls;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBall(balls: Ball[], id: string): Ball | undefined {
  return balls.find(b => b.id === id);
}

function getNextColorBallOn(current: BallOn): BallOn | null {
  const idx = COLOR_ORDER.indexOf(current);
  if (idx === -1 || idx === COLOR_ORDER.length - 1) return null;
  return COLOR_ORDER[idx + 1];
}

function respotColor(balls: Ball[], colorId: string): void {
  const ball = getBall(balls, colorId);
  const spot = SPOTS[colorId];
  if (!ball || !spot) return;

  // Find a free spot (spot not occupied by another ball)
  const occupied = (x: number, y: number) =>
    balls.some(b => !b.potted && b.id !== colorId &&
      Math.hypot(b.x - x, b.y - y) < BR * 2);

  if (!occupied(spot.x, spot.y)) {
    ball.x = spot.x;
    ball.y = spot.y;
    ball.potted = false;
    ball.vx = 0;
    ball.vy = 0;
  } else {
    // Place behind original spot as fallback (move toward baulk)
    for (let offset = BR * 2.5; offset < 400; offset += BR * 2) {
      const nx = spot.x - offset;
      if (nx < BR) break;
      if (!occupied(nx, spot.y)) {
        ball.x = nx;
        ball.y = spot.y;
        ball.potted = false;
        ball.vx = 0;
        ball.vy = 0;
        return;
      }
    }
  }
}

function highestBallOnTable(balls: Ball[]): number {
  return balls
    .filter(b => !b.potted && b.type !== 'cue')
    .reduce((max, b) => Math.max(max, b.points), 0);
}

// ── Shot resolution ──────────────────────────────────────────────────────────

export function resolveShot(state: GameState): void {
  const { balls, pottedThisShot, firstContact } = state;
  const cuePotted = pottedThisShot.includes('cue');

  // Gather non-cue potted balls
  const potted = pottedThisShot.filter(id => id !== 'cue');
  const pottedBalls = potted.map(id => balls.find(b => b.id === id)!).filter(Boolean);
  const pottedReds = pottedBalls.filter(b => b.type === 'red');
  const pottedColors = pottedBalls.filter(b => b.type === 'color');

  // ── Determine foul ──────────────────────────────────────────────────────

  let foul = false;
  let foulMsg = '';

  if (cuePotted) {
    foul = true;
    foulMsg = 'Foul – cue ball potted (scratch)!';
  } else if (!firstContact) {
    foul = true;
    foulMsg = 'Foul – no ball hit!';
  } else {
    const firstBall = getBall(balls, firstContact);
    if (firstBall) {
      const isRed = firstBall.type === 'red';
      const isColor = firstBall.type === 'color';
      const colorId = firstBall.id as BallOn;

      if (state.ballOn === 'red' && !isRed) {
        foul = true;
        foulMsg = `Foul – must hit a red first!`;
      } else if (state.ballOn === 'any_color' && !isColor) {
        foul = true;
        foulMsg = `Foul – must hit a colour first!`;
      } else if (
        COLOR_ORDER.includes(state.ballOn) &&
        state.ballOn !== 'any_color' &&
        isColor &&
        colorId !== state.ballOn
      ) {
        foul = true;
        foulMsg = `Foul – wrong colour! Must hit ${state.ballOn}`;
      }
    }
  }

  // Also check: potted a colour not on (during red phase)
  if (!foul && state.ballOn === 'red' && pottedColors.length > 0) {
    foul = true;
    foulMsg = `Foul – potted a colour ball off a red!`;
  }

  // ── Apply foul ──────────────────────────────────────────────────────────

  if (foul) {
    const penalty = Math.max(4, highestBallOnTable(balls));
    const opp = state.player === 0 ? 1 : 0;
    state.scores[opp] += penalty;

    // Re-spot any potted colours
    for (const b of pottedColors) respotColor(balls, b.id);

    // Re-spot potted reds (they go back in play after a foul? No — in snooker,
    // potted reds stay potted even on a foul. Only colours are re-spotted on fouls.)
    // Mark reds as permanently potted
    for (const b of pottedReds) {
      state.redsLeft = Math.max(0, state.redsLeft - 1);
    }

    // Cue ball in hand after scratch
    if (cuePotted) {
      const cue = getBall(balls, 'cue');
      if (cue) {
        cue.potted = false;
        cue.x = 150; cue.y = TH_CENTER;
        cue.vx = 0; cue.vy = 0;
      }
      state.phase = 'placing';
    } else {
      state.phase = 'aiming';
    }

    state.foulMsg = foulMsg;
    state.msg = `Foul! +${penalty} to Player ${opp + 1}`;
    state.player = (state.player === 0 ? 1 : 0);
    state.pottedThisShot = [];
    state.firstContact = null;
    return;
  }

  // ── Valid shot ──────────────────────────────────────────────────────────

  state.foulMsg = '';
  let scored = 0;
  let turnEnds = false;
  let nextBallOn: BallOn = state.ballOn;

  if (state.ballOn === 'red') {
    if (pottedReds.length > 0) {
      scored = pottedReds.reduce((s, b) => s + b.points, 0);
      state.redsLeft -= pottedReds.length;
      nextBallOn = 'any_color';
    } else {
      turnEnds = true;
    }
  } else if (state.ballOn === 'any_color') {
    if (pottedColors.length > 0) {
      scored = pottedColors.reduce((s, b) => s + b.points, 0);
      // Re-spot potted colours if reds remain
      for (const b of pottedColors) {
        if (state.redsLeft > 0) respotColor(balls, b.id);
      }
      nextBallOn = state.redsLeft > 0 ? 'red' : COLOR_ORDER[0];
    } else {
      // Missed colour after red — turn ends but no foul unless wrong ball hit
      turnEnds = true;
      nextBallOn = state.redsLeft > 0 ? 'red' : COLOR_ORDER[0];
    }
  } else {
    // Colour sequence (no reds left)
    const expected = state.ballOn as BallOn;
    const targetBall = pottedBalls.find(b => b.id === expected);
    if (targetBall) {
      scored = targetBall.points;
      // Do NOT re-spot — stays off table
      const nextColor = getNextColorBallOn(expected);
      nextBallOn = nextColor ?? expected; // last ball = black
      if (!nextColor) {
        // Black potted — check if game over by points or continue
        state.msg = `Player ${state.player + 1} pots the black! +${scored}`;
        state.scores[state.player] += scored;
        state.over = true;
        state.winner = state.scores[0] > state.scores[1] ? 0 :
          state.scores[1] > state.scores[0] ? 1 : null;
        state.phase = 'over';
        state.pottedThisShot = [];
        state.firstContact = null;
        return;
      }
    } else {
      turnEnds = true;
    }
  }

  state.scores[state.player] += scored;
  state.ballOn = nextBallOn;

  if (turnEnds) {
    state.player = (state.player === 0 ? 1 : 0);
    state.msg = `No pot — Player ${state.player + 1}'s turn`;
  } else {
    state.msg = scored > 0
      ? `+${scored} — Player ${state.player + 1} continues`
      : '';
  }

  state.phase = 'aiming';
  state.pottedThisShot = [];
  state.firstContact = null;
}

const TH_CENTER = 300; // TH / 2

export function createInitialState(): GameState {
  return {
    balls: buildInitialBalls(),
    phase: 'placing',
    player: 0,
    scores: [0, 0],
    ballOn: 'red',
    redsLeft: 15,
    firstContact: null,
    pottedThisShot: [],
    msg: 'Player 1: place the cue ball in the D',
    foulMsg: '',
    over: false,
    winner: null,
  };
}

export function isInD(x: number, y: number): boolean {
  const dx = x - 246; // BAULK_X
  const dy = y - 300; // TH/2
  return x <= 246 && dx * dx + dy * dy <= 96 * 96; // D_RAD
}
