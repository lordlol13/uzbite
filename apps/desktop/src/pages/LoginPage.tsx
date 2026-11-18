import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Language } from '@uzbite/shared';
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
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <div className="card w-full max-w-md p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8781d] text-lg font-extrabold text-white">
              U
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight">{t.appName}</div>
              <div className="text-[11px] font-semibold text-[var(--muted)]">Desktop Analytics · Case #26</div>
            </div>
          </div>

          <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-xs font-semibold">
            {(['ru', 'uz', 'en'] as const).map(code => (
              <button
                key={code}
                type="button"
                onClick={() => onLangChange(code)}
                className={`px-2.5 py-1.5 uppercase ${lang === code ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--muted)]'}`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        <h1 className="m-0 text-xl font-extrabold tracking-tight">{t.loginTitle}</h1>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{t.loginDesc}</p>

        {serverOnline === false && (
          <div className="mt-4 rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] px-3.5 py-2.5 text-xs text-[var(--text)]">
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
          <div className="mt-4 rounded-xl border border-[var(--bad)] bg-[var(--bad-soft)] px-3.5 py-2.5 text-xs font-semibold text-[var(--bad)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 grid gap-3.5">
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
            {t.email}
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
            {t.password}
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" disabled={loading} className="btn-primary mt-1 w-full">
            {t.signIn}
          </button>
        </form>

        <div className="my-4 border-t border-[var(--border)]" />

        <button type="button" disabled={loading} onClick={handleDemo} className="btn-secondary w-full">
          {t.demoSignIn}
        </button>
        <p className="mt-2.5 text-center text-[11px] text-[var(--muted)]">{t.demoHint}</p>
      </div>
    </div>
  );
}
