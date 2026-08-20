import type { ReactElement } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LocaleProvider } from './i18n/locale-context';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { OperationsPage } from './pages/OperationsPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';

export function App(): ReactElement {
  return (
    <LocaleProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </LocaleProvider>
  );
}
