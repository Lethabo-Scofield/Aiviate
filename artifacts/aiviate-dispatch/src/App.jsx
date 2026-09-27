import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import DriverLayout from "./components/DriverLayout";
import RoutesJobsPage from "./pages/RoutesJobsPage";
import Fleet from "./pages/Fleet";
import RouteMapPage from "./pages/RouteMapPage";
import MyJobs from "./pages/MyJobs";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import LiveOperationsPage from "./pages/LiveOperationsPage";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import DataSourcesSettingsPage from "./pages/DataSourcesSettingsPage";
import Orders from "./pages/Orders";
import Integrations from "./pages/Integrations";
import PublicTracking from "./pages/PublicTracking";
import {
  AiviateActivity,
  Approvals,
  Communications,
  Customers,
  Exceptions,
  Intelligence,
  OperationsCommand,
  Planning,
  PoliciesAutonomy,
  Vehicles,
} from "./pages/OperationsPages";

function AppRoutes() {
  const { user } = useAuth();
  const isDriver = user?.role === "driver";

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/track/:token" element={<PublicTracking />} />
      <Route element={<ProtectedRoute>{isDriver ? <DriverLayout /> : <Layout />}</ProtectedRoute>}>
        {isDriver ? (
          <>
            <Route path="/" element={<MyJobs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<OperationsCommand />} />
            <Route path="/map" element={<RouteMapPage />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/exceptions" element={<Exceptions />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/routes" element={<RoutesJobsPage />} />
            <Route path="/drivers" element={<Fleet />} />
            <Route path="/vehicles" element={<Vehicles />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/communications" element={<Communications />} />
            <Route path="/activity" element={<AiviateActivity />} />
            <Route path="/policies" element={<PoliciesAutonomy />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/jobs" element={<RoutesJobsPage />} />
            <Route path="/fleet" element={<Fleet />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/data-sources" element={<DataSourcesSettingsPage />} />
            <Route path="/profile" element={<Profile />} />
            {/* Legacy URLs kept for back-compat. */}
            <Route path="/ai-planner" element={<Navigate to="/" replace />} />
            <Route path="/command" element={<Navigate to="/" replace />} />
            <Route path="/dispatch" element={<Navigate to="/jobs?tab=dispatch" replace />} />
            <Route path="/devices" element={<Navigate to="/fleet?tab=devices" replace />} />
            <Route path="/safety" element={<Navigate to="/fleet?tab=safety" replace />} />
            <Route path="/live" element={<LiveOperationsPage />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/legacy-intelligence" element={<Alerts />} />
            <Route path="/guardians" element={<Navigate to="/" replace />} />
            <Route path="/events" element={<Navigate to="/" replace />} />
            <Route path="/alerts" element={<Navigate to="/" replace />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </>
        )}
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
