import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import DriverLayout from "./components/DriverLayout";
import DispatchCenter from "./pages/DispatchCenter";
import Jobs from "./pages/Jobs";
import MapView from "./pages/MapView";
import Drivers from "./pages/Drivers";
import MyJobs from "./pages/MyJobs";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import LiveOps from "./pages/LiveOps";
import SafetyCenter from "./pages/SafetyCenter";
import Devices from "./pages/Devices";
import Alerts from "./pages/Alerts";
import CommandCenter from "./pages/CommandCenter";
import Settings from "./pages/Settings";

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
            <Route path="/" element={<CommandCenter />} />
            <Route path="/live" element={<LiveOps />} />
            <Route path="/dispatch" element={<DispatchCenter />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/guardians" element={<Navigate to="/devices" replace />} />
            <Route path="/safety" element={<SafetyCenter />} />
            <Route path="/intelligence" element={<Alerts />} />
            <Route path="/events" element={<Navigate to="/intelligence" replace />} />
            <Route path="/alerts" element={<Navigate to="/intelligence" replace />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/profile" element={<Profile />} />
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
