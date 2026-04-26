import type { BallOn } from './types';

// Table play-area virtual coordinates (origin = top-left of felt)
export const TW = 1200;
export const TH = 600;
export const CW = 32;           // cushion thickness
export const CAN_W = TW + CW * 2;
export const CAN_H = TH + CW * 2;

export const BR = 16.5;         // ball radius

// Physics (per sub-step; 2 sub-steps run per animation frame)
export const NUM_SUBSTEPS = 2;
export const FRICTION = 0.993;       // per sub-step → ~0.986 per frame (long rolling)
export const MIN_V = 0.08;
export const RESTITUTION_C = 0.75;   // cushion
export const RESTITUTION_B = 0.97;   // ball-ball

// Table markings (x measured from baulk end, y from top)
export const BAULK_X = 246;
export const D_RAD = 96;        // 11.5" radius in scale

// Colour spots (table-area coordinates)
export const SPOTS: Record<string, { x: number; y: number }> = {
  yellow: { x: BAULK_X, y: TH / 2 + D_RAD },
  green:  { x: BAULK_X, y: TH / 2 - D_RAD },
  brown:  { x: BAULK_X, y: TH / 2 },
  blue:   { x: TW / 2,  y: TH / 2 },
  // Pink: midway between blue (600) and top cushion (1200) = 75% → 900px
  pink:   { x: 900,     y: TH / 2 },
  // Black: 12.75" from top cushion → 91.2% of table length
  black:  { x: 1094,    y: TH / 2 },
};

// Reds triangle: apex is the ball NEAREST to pink (left side of cluster).
// The triangle expands RIGHTWARD toward the black end.
// Apex is placed just to the right of the pink spot (almost touching).
export const APEX_X = 936;   // pink(900) + 2*BR(33) + 3px gap
export const APEX_Y = TH / 2;

// Pockets: position in table-area coords + detection radius
// Detection radius must be larger than BR (16.5) so balls are caught before
// being reflected by the cushion bounce code.
export const POCKETS = [
  { x: 0,      y: 0,   r: 28 },  // corner
  { x: TW / 2, y: 0,   r: 25 },  // middle
  { x: TW,     y: 0,   r: 28 },  // corner
  { x: 0,      y: TH,  r: 28 },  // corner
  { x: TW / 2, y: TH,  r: 25 },  // middle
  { x: TW,     y: TH,  r: 28 },  // corner
];

// Visual pocket mouth radius (drawn on canvas)
export const POCKET_VIS_CORNER = 28;
export const POCKET_VIS_MIDDLE = 24;

// Colour-sequence for end of frame (no reds left)
export const COLOR_ORDER: BallOn[] = [
  'yellow', 'green', 'brown', 'blue', 'pink', 'black',
];

// MAX_SPEED is the velocity per sub-step at 100% power
// Effective max-speed per frame = MAX_SPEED * NUM_SUBSTEPS = 60 units/frame
export const MAX_SPEED = 60;

// Ball palette
export const BALL_PALETTE: Record<string, { fill: string; stroke: string }> = {
  cue:    { fill: '#F5EFE0', stroke: '#C8C0A8' },
  red:    { fill: '#C0392B', stroke: '#922B21' },
  yellow: { fill: '#F4D03F', stroke: '#C9A40B' },
  green:  { fill: '#27AE60', stroke: '#1A7A42' },
  brown:  { fill: '#7D5731', stroke: '#5A3E22' },
  blue:   { fill: '#1565C0', stroke: '#0D47A1' },
  pink:   { fill: '#E91E8C', stroke: '#B51570' },
  black:  { fill: '#212121', stroke: '#111111' },
};
