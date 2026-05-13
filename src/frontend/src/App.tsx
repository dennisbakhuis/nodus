import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./shared/Layout";
import { AuthCallbackPage } from "./shared/AuthCallbackPage";
import { AuthProvider } from "./shared/AuthContext";
import { ConfirmProvider } from "./shared/ConfirmDialog";
import { ErrorBoundary } from "./shared/ErrorBoundary";
import { ExportProvider } from "./shared/ExportContext";
import { AddActionProvider } from "./shared/AddActionContext";
import { DemoModeProvider } from "./shared/DemoModeContext";
import { RadarCycleProvider } from "./shared/RadarCycleContext";
import { HelpProvider } from "./help/HelpContext";
import { RadarPage } from "./radar/RadarPage";
import { ListPage } from "./radar/ListPage";
import { ManagePage } from "./manage/ManagePage";
import { CyclesPage } from "./manage/CyclesPage";
import { ApiPage } from "./manage/ApiPage";
import { SettingsPage } from "./manage/SettingsPage";
import { SegmentsPage } from "./manage/SegmentsPage";
import { PersonsPage } from "./manage/PersonsPage";
import { UsersPage } from "./manage/UsersPage";
import { VisibilityPage } from "./manage/VisibilityPage";
import { BackupPage } from "./manage/BackupPage";
import { ImportPage } from "./manage/ImportPage";

/**
 * Routes wrapper that resets the route-level ErrorBoundary on navigation —
 * if the user navigates away from a broken page, the new page renders fresh
 * instead of inheriting the old error.
 */
function RoutedContent() {
  const location = useLocation();
  return (
    <ErrorBoundary name="route" resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<Navigate to="/radar" replace />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/radar" element={<RadarPage />} />
        <Route path="/radar/:slug" element={<RadarPage />} />
        <Route path="/list" element={<ListPage />} />
        {/* /manage/technologies merged into /list. The redirect is kept on
            the outer path too so any deep link "/manage/technologies?..."
            forwards cleanly. */}
        <Route
          path="/manage/technologies"
          element={<Navigate to="/list" replace />}
        />
        <Route path="/manage" element={<ManagePage />}>
          <Route index element={<Navigate to="cycles" replace />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="cycles" element={<CyclesPage />} />
          <Route path="segments" element={<SegmentsPage />} />
          <Route path="persons" element={<PersonsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="visibility" element={<VisibilityPage />} />
          <Route path="backup" element={<BackupPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="api" element={<ApiPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ExportProvider>
        <AddActionProvider>
          <DemoModeProvider>
            <RadarCycleProvider>
              <ConfirmProvider>
                <HelpProvider>
                  <ErrorBoundary name="root">
                    <Layout>
                      <RoutedContent />
                    </Layout>
                  </ErrorBoundary>
                </HelpProvider>
              </ConfirmProvider>
            </RadarCycleProvider>
          </DemoModeProvider>
        </AddActionProvider>
      </ExportProvider>
    </AuthProvider>
  );
}
