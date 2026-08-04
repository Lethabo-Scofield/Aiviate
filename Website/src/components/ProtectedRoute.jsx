import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { FullScreenLoader } from "./Loader";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
