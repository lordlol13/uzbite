import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Language } from '@uzbite/shared';
import {
  BrandLogoBadge,
  IconEye,
  IconEyeOff,
  IconRefresh,
  IconSparkles,
  IconSpinner,
} from '../components/DesignWidgets';
import { businessLogin, checkBusinessBackendHealth, type StoredAuth } from '../lib/api';
import { COPY } from '../lib/i18n';

export function LoginPage({
  lang,
  onLangChange,
  onLoggedIn,
}: {
  lang: Language;
  onLangChange: (lang: Language) => void;
  onLoggedIn: (auth: StoredAuth) => void;
}) {
  const t = COPY[lang];
  const [email, setEmail] = useState('owner@uzbite.uz');
  const [password, setPassword] = useState('UzBiteBusiness2026!');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);

  const verifyServer = useCallback(async () => {
    setCheckingServer(true);
    try {
      const check = await checkBusinessBackendHealth();
      setServerOnline(check.ok);
    } finally {
      setCheckingServer(false);
    }
  }, []);

  useEffect(() => {
    void verifyServer();
  }, [verifyServer]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const auth = await businessLogin({ email, password });
      onLoggedIn(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setLoading(true);
    setError(null);
    try {
      const auth = await businessLogin({ demo: true });
      onLoggedIn(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] p-6">
      <div className="ai-grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-80" />

      {/* Ambient soft glowing orbs */}
      <div
        className="animate-orb-halo pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(236,81,128,0.16) 0%, rgba(129,114,255,0.08) 55%, transparent 75%)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-10 right-[15%] h-64 w-64 rounded-full blur-3xl opacity-60"
        style={{
          background: 'radial-gradient(circle, rgba(54,184,154,0.12) 0%, transparent 70%)',
        }}
      />

      <div className="card animate-page-enter relative z-10 w-full max-w-md p-8 shadow-xl">
        <div className="animate-card-in stagger-1 mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogoBadge size={40} />
            <div>
              <div className="text-[16px] font-semibold tracking-tight text-[var(--text)]">{t.appName}</div>
              <div className="text-[11px] font-medium text-[var(--muted)]">Desktop Analytics · Case #26</div>
            </div>
          </div>

          <div className="flex overflow-hidden rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] p-0.5 text-[11px] font-medium">
            {(['ru', 'uz', 'en'] as const).map(code => (
              <button
                key={code}
                type="button"
                onClick={() => onLangChange(code)}
                className={`rounded-full px-2.5 py-1 uppercase transition-all duration-150 ${
                  lang === code
                    ? 'bg-[var(--surface)] font-semibold text-[var(--text)] shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        <div className="animate-card-in stagger-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h1 className="m-0 text-[22px] font-medium tracking-[-0.02em] text-[var(--text)]">{t.loginTitle}</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                serverOnline === true
                  ? 'bg-[var(--good-soft)] text-[var(--good)]'
                  : serverOnline === false
                    ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                    : 'bg-[var(--surface-2)] text-[var(--muted)]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  serverOnline === true
                    ? 'bg-[var(--good)] animate-pulse'
                    : serverOnline === false
                      ? 'bg-[var(--warn)]'
                      : 'bg-[var(--muted-soft)] animate-pulse'
                }`}
              />
              {checkingServer
                ? '...'
                : serverOnline === true
                  ? 'Online'
                  : serverOnline === false
                    ? 'Offline'
                    : '...'}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{t.loginDesc}</p>
        </div>

        {serverOnline === false && (
          <div className="animate-slide-up mt-4 rounded-xl border border-[var(--warn)]/60 bg-[var(--warn-soft)] px-3.5 py-2.5 text-xs text-[var(--text)]">
            <div className="font-bold">
              {lang === 'uz'
                ? 'UzBite backend serveri ishga tushirilmagan'
                : lang === 'en'
                  ? 'UzBite backend server is currently offline'
                  : 'Сервер UzBite сейчас недоступен'}
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">
              {lang === 'uz'
                ? 'Loyiha papkasidan Start-UzBite-All.cmd yoki npm run dev:server ni ishga tushiring.'
                : lang === 'en'
                  ? 'Run Start-UzBite-All.cmd or npm run dev:server from the project folder.'
                  : 'Запустите Start-UzBite-All.cmd или npm run dev:server из папки проекта.'}
            </div>
            <button
              type="button"
              disabled={checkingServer}
              onClick={() => void verifyServer()}
              className="btn-secondary mt-2 min-h-0 px-2.5 py-1 text-[11px]"
            >
              <IconRefresh size={12} className={checkingServer ? 'animate-spin' : ''} />
              {checkingServer
                ? '...'
                : lang === 'uz'
                  ? 'Qayta tekshirish'
                  : lang === 'en'
                    ? 'Retry check'
                    : 'Проверить снова'}
            </button>
          </div>
        )}

        {error && (
          <div className="animate-slide-up mt-4 rounded-xl border border-[var(--bad)]/60 bg-[var(--bad-soft)] px-3.5 py-2.5 text-xs font-semibold text-[var(--bad)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="animate-card-in stagger-3 mt-5 grid gap-3.5">
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
            {t.email}
            <input
              type="email"
              autoComplete="email"
              className="input-field"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
            {t.password}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="input-field pr-10"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                {showPassword ? <IconEyeOff size={15} /> : <IconEye size={15} />}
              </button>
            </div>
          </label>

          <button type="submit" disabled={loading} className="btn-primary mt-1 w-full">
            {loading && <IconSpinner size={14} />}
            {t.signIn}
          </button>
        </form>

        <div className="animate-card-in stagger-4 my-4 border-t border-[var(--border)]" />

        <div className="animate-card-in stagger-5">
          <button type="button" disabled={loading} onClick={handleDemo} className="btn-secondary w-full hover-lift">
            {loading ? <IconSpinner size={14} /> : <IconSparkles size={14} className="text-[var(--accent)]" />}
            {t.demoSignIn}
          </button>
          <p className="mt-2.5 text-center text-[11px] text-[var(--muted)]">{t.demoHint}</p>
        </div>
      </div>
    </div>
  );
}
