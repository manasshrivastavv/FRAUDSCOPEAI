import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ScannerPage } from './pages/ScannerPage';
import { UrlScannerPage } from './pages/UrlScannerPage';
import { WebsiteXRayPage } from './pages/WebsiteXRayPage';
import { InvestigationPage } from './pages/InvestigationPage';
import { AdvertisementsPage } from './pages/AdvertisementsPage';
import { ThreatNetworkPage } from './pages/ThreatNetworkPage';
import { CasesPage } from './pages/CasesPage';
import { AlertsPage } from './pages/AlertsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          {/* Public Landing, Login & Registration */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Authenticated FRAUDSCOPE AI Workspace Routes guarded by ProtectedRoute */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              {/* Overview / Dashboard */}
              <Route path="/console" element={<DashboardPage />} />
              <Route path="/dashboard" element={<Navigate to="/console" replace />} />

              {/* Module 1: Smart URL Scanner */}
              <Route path="/url-scanner" element={<UrlScannerPage />} />

              {/* Module 2: Website X-Ray */}
              <Route path="/website-xray" element={<WebsiteXRayPage />} />

              {/* Studio Scanner (Ad & Message Scanner) */}
              <Route path="/scanner" element={<ScannerPage />} />
              <Route path="/ad-scanner" element={<Navigate to="/scanner" replace />} />

              {/* Flagged Posts & Investigation Dossiers */}
              <Route path="/flagged-posts" element={<AdvertisementsPage />} />
              <Route path="/investigations" element={<Navigate to="/flagged-posts" replace />} />
              <Route path="/advertisements" element={<Navigate to="/flagged-posts" replace />} />
              <Route path="/investigations/:id" element={<InvestigationPage />} />

              {/* Module 4: Fraud Network Detective */}
              <Route path="/network" element={<ThreatNetworkPage />} />
              <Route path="/clusters" element={<Navigate to="/network" replace />} />

              {/* 4. Forensic Reports */}
              <Route path="/reports" element={<ReportsPage />} />

              {/* 5. System Settings */}
              <Route path="/settings" element={<SettingsPage />} />

              {/* Auxiliary Case Management & Alert Feeds */}
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/cases" element={<CasesPage />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </LanguageProvider>
  );
}

export default App;
