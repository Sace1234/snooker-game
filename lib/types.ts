export interface Ball {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  fill: string;
  stroke: string;
  points: number;
  potted: boolean;
  type: 'cue' | 'red' | 'color';
}

export type BallOn =
  | 'red'
  | 'any_color'
  | 'yellow'
  | 'green'
  | 'brown'
  | 'blue'
  | 'pink'
  | 'black';

export type Phase =
  | 'placing'   // cue ball in hand
  | 'aiming'    // ready to shoot
  | 'rolling'   // balls in motion
  | 'over';     // frame ended

export interface GameState {
  balls: Ball[];
  phase: Phase;
  player: 0 | 1;
  scores: [number, number];
  ballOn: BallOn;
  redsLeft: number;
  firstContact: string | null;
  pottedThisShot: string[];
  msg: string;
  foulMsg: string;
  over: boolean;
  winner: number | null;
}
