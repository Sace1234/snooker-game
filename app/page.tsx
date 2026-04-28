'use client';

import { useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, type Profile } from '@/lib/supabase';
import SnookerGame from '@/components/SnookerGame';
import AuthScreen from '@/components/AuthScreen';

export default function Home() {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check for an existing session on first load
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
      else setLoading(false);
    });

    // Keep state in sync with Supabase auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) fetchProfile(u.id);
        else { setProfile(null); setLoading(false); }
      },
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0A0A]">
        <div className="text-gray-600 text-sm tracking-widest uppercase">Loading…</div>
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthScreen onSuccess={() => {}} />;
  }

  return (
    <SnookerGame
      user={{ id: user.id, username: profile.username }}
      onSignOut={handleSignOut}
    />
  );
}
