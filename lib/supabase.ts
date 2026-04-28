import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface Profile {
  id: string;
  username: string;
  created_at: string;
}

export interface Frame {
  id: string;
  player1_id: string;
  player1_name: string;
  player2_name: string;
  player1_score: number;
  player2_score: number;
  winner: 'player1' | 'player2' | 'draw' | null;
  played_at: string;
}
