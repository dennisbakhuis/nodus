import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./shared/Layout";
import { AuthCallbackPage } from "./shared/AuthCallbackPage";
import { AuthProvider } from "./shared/AuthContext";
import { ProtectedRoute } from "./shared/ProtectedRoute";
import { CapabilityRoute } from "./shared/CapabilityRoute";
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
import { GroupsPage } from "./manage/GroupsPage";
import { PersonsPage } from "./manage/PersonsPage";
import { UsersPage } from "./manage/UsersPage";
import { VisibilityPage } from "./manage/VisibilityPage";
import { BackupPage } from "./manage/BackupPage";
import { ImportPage } from "./manage/ImportPage";
import { GuidePage } from "./guide/GuidePage";

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
        <Route path="/guide" element={<GuidePage />} />
        <Route
          path="/list"
          element={
            <CapabilityRoute capability="canViewList">
              <ListPage />
            </CapabilityRoute>
          }
        />
        {/* /manage/technologies merged into /list. The redirect is kept on
            the outer path too so any deep link "/manage/technologies?..."
            forwards cleanly. */}
        <Route
          path="/manage/technologies"
          element={<Navigate to="/list" replace />}
        />
        <Route
          path="/manage"
          element={
            <ProtectedRoute requireRole="writer">
              <ManagePage />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="cycles" replace />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="cycles" element={<CyclesPage />} />
          <Route
            path="segments"
            element={
              <ProtectedRoute requireRole="admin" redirectTo="/manage/cycles">
                <SegmentsPage />
              </ProtectedRoute>
            }
          />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="persons" element={<PersonsPage />} />
          <Route
            path="users"
            element={
              <ProtectedRoute requireRole="admin" redirectTo="/manage/cycles">
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="visibility"
            element={
              <ProtectedRoute requireRole="admin" redirectTo="/manage/cycles">
                <VisibilityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="backup"
            element={
              <ProtectedRoute requireRole="admin" redirectTo="/manage/cycles">
                <BackupPage />
              </ProtectedRoute>
            }
          />
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
