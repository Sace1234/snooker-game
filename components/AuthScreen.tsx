'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  onSuccess: () => void;
  onClose?: () => void;
}

export default function AuthScreen({ onSuccess, onClose }: Props) {
  const [mode, setMode]         = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (mode === 'signup') {
      // 1. Create auth account
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // 2. Insert profile row if we have a user immediately
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ id: data.user.id, username: username.trim() });

        if (profileError) {
          // Username likely taken
          setError(profileError.message.includes('unique')
            ? 'That username is already taken — try another.'
            : profileError.message);
          setLoading(false);
          return;
        }
      }

      // If email confirmation is required, session is null — tell user to check email
      if (!data.session) {
        setMessage('Account created! Check your email for a confirmation link, then sign in.');
        setMode('signin');
        setLoading(false);
        return;
      }

      // Confirmed immediately (email confirmation disabled in Supabase)
      onSuccess();

    } else {
      // Sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : signInError.message);
        setLoading(false);
        return;
      }

      onSuccess();
    }

    setLoading(false);
  };

  const inner = (
    <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-[10px] tracking-[0.5em] text-green-700 uppercase font-semibold mb-2">
            Snooker
          </div>
          <h1 className="text-3xl font-bold text-white">
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            {mode === 'signin'
              ? 'Sign in to track your scores'
              : 'Sign up to save your game results'}
          </p>
        </div>

        {/* Toggle */}
        <div className="flex bg-[#111] rounded-xl p-1 mb-6 border border-[#222]">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(''); setMessage(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all
              ${mode === 'signin'
                ? 'bg-green-800 text-green-100 shadow'
                : 'text-gray-500 hover:text-gray-300'}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all
              ${mode === 'signup'
                ? 'bg-green-800 text-green-100 shadow'
                : 'text-gray-500 hover:text-gray-300'}`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {mode === 'signup' && (
            <div>
              <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                required
                maxLength={20}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. Ronnie147"
                className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-green-700 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-green-700 text-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-green-700 text-sm"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {message && (
            <div className="text-green-400 text-sm bg-green-950/40 border border-green-900/50 rounded-xl px-4 py-3">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-green-800 hover:bg-green-700 active:bg-green-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white font-bold text-sm tracking-wide mt-2"
          >
            {loading
              ? 'Please wait…'
              : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-gray-700 text-xs mt-6">
          Your data is stored securely in Supabase.
        </p>
      </div>
  );

  if (onClose) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="relative w-full max-w-sm">
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333] text-gray-400 hover:text-white flex items-center justify-center text-lg leading-none z-10"
            aria-label="Close"
          >
            ×
          </button>
          <div className="bg-[#0A0A0A] rounded-2xl border border-[#222] p-6">
            {inner}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A] p-6">
      {inner}
    </div>
  );
}
