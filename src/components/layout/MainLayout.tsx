/**
 * Main Layout Component
 * TitleBar at top, then sidebar + content below.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';

export function MainLayout() {
  const location = useLocation();
  const isChatRoute = location.pathname === '/';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Title bar: drag region on macOS, icon + controls on Windows */}
      <TitleBar />

      {/* Below the title bar: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main
          className={
            isChatRoute
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden p-0'
              : 'min-h-0 flex-1 overflow-auto p-6'
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
