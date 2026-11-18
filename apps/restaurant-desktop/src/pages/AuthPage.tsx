import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkBackendHealth, loginRestaurant, registerRestaurant } from '../api/client';
import { ErrorBanner, Modal } from '../components/Common';
import { Icon } from '../components/Icon';
import { Wordmark } from '../components/Wordmark';
import { useSession } from '../store/session';

export function AuthPage() {
  const { config, updateConfig, setAuthSession } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);

  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(config.apiBaseUrl);
  const [healthResult, setHealthResult] = useState<string>('');

  const verifyServer = useCallback(async (targetUrl: string) => {
    setCheckingServer(true);
    try {
      const check = await checkBackendHealth(targetUrl);
      setServerOnline(check.ok);
    } finally {
      setCheckingServer(false);
    }
  }, []);

  useEffect(() => {
    void verifyServer(config.apiBaseUrl);
  }, [config.apiBaseUrl, verifyServer]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirmPassword) {
      setError('Пароль и подтверждение пароля не совпадают');
      return;
    }
    setLoading(true);
    try {
      const auth =
        mode === 'login'
          ? await loginRestaurant({ email: email.trim(), password })
          : await registerRestaurant({
              email: email.trim(),
              password,
              confirmPassword,
              restaurantName: restaurantName.trim() || undefined,
              language: config.language,
              theme: config.theme,
            });
      await setAuthSession(auth);
      navigate(auth.user.onboardingCompleted ? '/dashboard' : '/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить вход');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setError('');
    setLoading(true);
    try {
      const auth = await loginRestaurant({ demo: true });
      await setAuthSession(auth);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Демо-вход недоступен');
    } finally {
      setLoading(false);
    }
  }

  async function saveServerUrl() {
    setHealthResult('');
    try {
      const clean = serverUrlInput.trim().replace(/\/+$/, '');
      await updateConfig({ apiBaseUrl: clean });
      const check = await checkBackendHealth(clean);
      setServerOnline(check.ok);
      setHealthResult(check.ok ? `Подключено (${check.status})` : `Сервер недоступен (${check.status})`);
    } catch (err) {
      setHealthResult(err instanceof Error ? err.message : 'Некорректный URL');
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--bg)] p-6">
      <div className="ai-grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="card relative z-10 w-full max-w-md p-8">
        <div className="flex items-center justify-between">
          <Wordmark withIcon subtitle="Windows Desktop" />
          <button
            type="button"
            onClick={() => {
              setServerUrlInput(config.apiBaseUrl);
              setHealthResult('');
              setServerModalOpen(true);
            }}
            className="btn-secondary min-h-0 px-3 py-1.5 text-xs"
          >
            <Icon name="server" size={14} /> Сервер
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[11px] font-semibold text-[var(--muted)] opacity-60">
            <Icon name="user" size={18} />
            <span className="mt-1">Покупатель</span>
            <span className="text-[9px]">Мобильный</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-2.5 text-[11px] font-semibold text-[var(--accent)]">
            <Icon name="restaurant" size={18} />
            <span className="mt-1">Ресторан</span>
            <span className="text-[9px]">Активен</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[11px] font-semibold text-[var(--muted)] opacity-60">
            <Icon name="bicycle" size={18} />
            <span className="mt-1">Курьер</span>
            <span className="text-[9px]">Мобильный</span>
          </div>
        </div>

        <h1 className="mt-5 mb-1 text-[22px] font-medium tracking-[-0.02em]">
          {mode === 'login' ? 'Вход в аккаунт ресторана' : 'Регистрация ресторана'}
        </h1>
        <p className="mt-0 mb-4 text-xs text-[var(--muted)]">
          Подключение к единому серверу UzBite: <span className="font-semibold">{config.apiBaseUrl}</span>
        </p>

        {serverOnline === false && (
          <div className="mb-4 rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] px-3.5 py-2.5 text-xs text-[var(--text)]">
            <div className="font-bold">Сервер UzBite сейчас недоступен</div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">
              Запустите <code>Start-UzBite-Restaurant.cmd</code> или <code>Start-UzBite-All.cmd</code> из папки
              проекта, либо укажите рабочий адрес через кнопку «Сервер».
            </div>
            <button
              type="button"
              disabled={checkingServer}
              onClick={() => void verifyServer(config.apiBaseUrl)}
              className="btn-secondary mt-2 min-h-0 px-2.5 py-1 text-[11px]"
            >
              {checkingServer ? 'Проверка…' : 'Проверить снова'}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-3.5">
          {mode === 'register' && (
            <label className="text-xs font-bold text-[var(--muted)]">
              Название ресторана
              <input
                type="text"
                className="input-field mt-1"
                value={restaurantName}
                onChange={e => setRestaurantName(e.target.value)}
                placeholder="Например: Chorsu Osh"
                maxLength={120}
              />
            </label>
          )}

          <label className="text-xs font-bold text-[var(--muted)]">
            Email
            <input
              type="email"
              className="input-field mt-1"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="restaurant@uzbite.uz"
            />
          </label>

          <label className="text-xs font-bold text-[var(--muted)]">
            Пароль
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field pr-10"
                required
                minLength={mode === 'register' ? 8 : 1}
                maxLength={72}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Не менее 8 символов' : '••••••••'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--muted)]"
                aria-label="Показать пароль"
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
          </label>

          {mode === 'register' && (
            <label className="text-xs font-bold text-[var(--muted)]">
              Подтверждение пароля
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field mt-1"
                required
                minLength={8}
                maxLength={72}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
              />
            </label>
          )}

          <ErrorBanner message={error} />

          <button type="submit" disabled={loading} className="btn-primary mt-1 w-full">
            {loading ? 'Подождите…' : mode === 'login' ? 'Войти в кабинет' : 'Зарегистрировать ресторан'}
          </button>
        </form>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleDemoLogin()}
            className="btn-secondary w-full text-xs"
          >
            Быстрый вход (демо-ресторан Osh & Olov)
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode(m => (m === 'login' ? 'register' : 'login'));
              setError('');
            }}
            className="py-1.5 text-center text-xs font-bold text-[var(--accent)]"
          >
            {mode === 'login' ? 'Нет аккаунта? Зарегистрировать ресторан' : 'Уже есть аккаунт? Войти'}
          </button>
        </div>
      </div>

      {serverModalOpen && (
        <Modal title="Адрес общего сервера UzBite" onClose={() => setServerModalOpen(false)}>
          <p className="mt-0 mb-3 text-xs text-[var(--muted)]">
            Для локального тестирования укажите адрес компьютера с Backend (например{' '}
            <code>http://127.0.0.1:8081</code> или LAN IP <code>http://192.168.1.100:8081</code>). Для
            облачного запуска укажите HTTPS-домен API.
          </p>
          <label className="text-xs font-bold text-[var(--muted)]">
            API Base URL
            <input
              type="url"
              className="input-field mt-1"
              value={serverUrlInput}
              onChange={e => setServerUrlInput(e.target.value)}
              placeholder="http://127.0.0.1:8081"
            />
          </label>
          {healthResult && (
            <div className="mt-3 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs font-bold">
              Статус проверки: {healthResult}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setServerModalOpen(false)}>
              Закрыть
            </button>
            <button type="button" className="btn-primary" onClick={() => void saveServerUrl()}>
              Сохранить и проверить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
