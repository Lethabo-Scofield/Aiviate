import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { FullScreenLoader } from "./Loader";

export default function ProtectedRoute({ children }) {
  const { user, loading, loginDemo } = useAuth();
  const attemptedPreviewLogin = useRef(false);
  const [previewLoginFailed, setPreviewLoginFailed] = useState(false);
  const previewHome = import.meta.env.DEV && window.location.pathname === "/";

  useEffect(() => {
    if (!previewHome || loading || user || attemptedPreviewLogin.current) return;
    attemptedPreviewLogin.current = true;
    loginDemo().catch(() => setPreviewLoginFailed(true));
  }, [previewHome, loading, user, loginDemo]);

  if (loading || (previewHome && !user && !previewLoginFailed)) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
