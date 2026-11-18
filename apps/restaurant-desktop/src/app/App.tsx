import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DesktopShell } from '../layouts/DesktopShell';
import { AiChatPage } from '../pages/AiChatPage';
import { AuthPage } from '../pages/AuthPage';
import { CategoriesPage } from '../pages/CategoriesPage';
import { CouriersPage } from '../pages/CouriersPage';
import { DashboardPage } from '../pages/DashboardPage';
import { DeliveryPage } from '../pages/DeliveryPage';
import { MenuPage } from '../pages/MenuPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { OnboardingPage } from '../pages/OnboardingPage';
import { OrderDetailPage } from '../pages/OrderDetailPage';
import { OrdersPage } from '../pages/OrdersPage';
import { PaymentsPage } from '../pages/PaymentsPage';
import { PostsPage } from '../pages/PostsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SettingsPage } from '../pages/SettingsPage';
import { StatisticsPage } from '../pages/StatisticsPage';
import { AiWorkspaceProvider } from '../store/aiWorkspace';
import { SessionProvider, useSession } from '../store/session';

function AppRoutes() {
  const { ready, auth } = useSession();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-xs font-bold text-[var(--muted)]">
        Загрузка UzBite Restaurant…
      </div>
    );
  }

  if (!auth) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  return (
    <AiWorkspaceProvider>
      <DesktopShell>
        <Routes>
          <Route path="/ai-chat" element={<AiChatPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/posts" element={<PostsPage />} />
          <Route path="/couriers" element={<CouriersPage />} />
          <Route path="/delivery" element={<DeliveryPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="*"
            element={
              <Navigate to={auth.user.onboardingCompleted ? '/dashboard' : '/onboarding'} replace />
            }
          />
        </Routes>
      </DesktopShell>
    </AiWorkspaceProvider>
  );
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
}

export default App;
