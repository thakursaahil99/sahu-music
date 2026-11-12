'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isValidEmail, validatePassword, validateTitle } from '@sahu/shared';
import { useAuth } from '@/lib/auth';
import { LogoMark } from './Logo';
import { ConfigNotice } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const { configured, user, signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const mail = email.trim().toLowerCase();
    if (!isValidEmail(mail)) return setError('Enter a valid email address.');
    if (signup) {
      const nameErr = validateTitle(name, 50);
      if (nameErr) return setError(nameErr);
      const pwErr = validatePassword(password);
      if (pwErr) return setError(pwErr);
    } else if (!password) return setError('Enter your password.');

    setBusy(true);
    if (signup) {
      const r = await signUp(mail, password, name.trim());
      if (r.error) setError(r.error);
      else if (r.needsConfirmation) setNotice('Account created. Check your email to confirm your address, then log in.');
    } else {
      const err = await signIn(mail, password);
      if (err) setError(err);
    }
    setBusy(false);
  };

  const forgot = async () => {
    setError(null);
    const mail = email.trim().toLowerCase();
    if (!isValidEmail(mail)) return setError('Enter your email above first, then tap “Forgot password”.');
    const err = await resetPassword(mail);
    if (err) setError(err);
    else setNotice('If that email has an account, a password reset link is on its way.');
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark size={64} />
        <h1 className="mt-4 text-2xl font-extrabold text-white">{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1 text-sm text-muted">{signup ? 'Free forever. No subscription.' : 'Log in to sync your library across devices.'}</p>
      </div>

      {!configured && (
        <div className="mb-5">
          <ConfigNotice title="Accounts are not configured on this deployment">
            <p>Accounts need the SAHU MUSIC backend and a database. Deploy on Vercel with the free Neon database connected (see README).</p>
            <p>Until then you can use everything in guest mode. Your library is saved on this device.</p>
          </ConfigNotice>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-4" noValidate>
        {signup && (
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-white">Name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoComplete="name" disabled={!configured} required />
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-white">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" disabled={!configured} required />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-white">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
            autoComplete={signup ? 'new-password' : 'current-password'}
            disabled={!configured}
            required
          />
          {signup && <p className="mt-1 text-xs text-muted">At least 8 characters with a letter and a number.</p>}
        </div>
        {error && <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>}
        {notice && <p className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold-soft" role="status">{notice}</p>}
        <button type="submit" className="btn-gold w-full" disabled={!configured || busy}>
          {busy ? 'Please wait…' : signup ? 'Sign up' : 'Log in'}
        </button>
        {!signup && (
          <button type="button" onClick={forgot} disabled={!configured} className="block w-full text-center text-sm text-muted hover:text-gold disabled:opacity-50">
            Forgot password?
          </button>
        )}
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {signup ? 'Already have an account? ' : 'New to SAHU MUSIC? '}
        <Link href={signup ? '/login' : '/signup'} className="font-semibold text-gold hover:text-gold-soft">
          {signup ? 'Log in' : 'Create an account'}
        </Link>
      </p>
      <p className="mt-2 text-center text-sm">
        <Link href="/" className="text-white/80 underline-offset-2 hover:text-white hover:underline">Continue as guest</Link>
      </p>
      {signup && (
        <p className="mt-4 text-center text-xs text-muted">
          By signing up you agree to our <Link href="/terms" className="text-gold">Terms</Link> and <Link href="/privacy" className="text-gold">Privacy Policy</Link>.
        </p>
      )}
    </div>
  );
}
