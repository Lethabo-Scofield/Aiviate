import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import DriverLayout from "./components/DriverLayout";
import JobsCenter from "./pages/JobsCenter";
import Fleet from "./pages/Fleet";
import MapView from "./pages/MapView";
import MyJobs from "./pages/MyJobs";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import LiveOps from "./pages/LiveOps";
import Alerts from "./pages/Alerts";
import Operations from "./pages/Operations";
import Settings from "./pages/Settings";
import DataSources from "./pages/DataSources";
import Orders from "./pages/Orders";
import Integrations from "./pages/Integrations";

function AppRoutes() {
  const { user } = useAuth();
  const isDriver = user?.role === "driver";

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute>{isDriver ? <DriverLayout /> : <Layout />}</ProtectedRoute>}>
        {isDriver ? (
          <>
            <Route path="/" element={<MyJobs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Operations />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/jobs" element={<JobsCenter />} />
            <Route path="/fleet" element={<Fleet />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/data-sources" element={<DataSources />} />
            <Route path="/profile" element={<Profile />} />
            {/* Legacy URLs kept for back-compat — planning now lives with the agent,
                and Drivers/Devices/Safety now live under Fleet. */}
            <Route path="/ai-planner" element={<Navigate to="/" replace />} />
            <Route path="/command" element={<Navigate to="/" replace />} />
            <Route path="/dispatch" element={<Navigate to="/jobs?tab=dispatch" replace />} />
            <Route path="/drivers" element={<Navigate to="/fleet" replace />} />
            <Route path="/devices" element={<Navigate to="/fleet?tab=devices" replace />} />
            <Route path="/safety" element={<Navigate to="/fleet?tab=safety" replace />} />
            <Route path="/live" element={<LiveOps />} />
            <Route path="/intelligence" element={<Alerts />} />
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
