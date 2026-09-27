import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { FullScreenLoader } from "./Loader";

export default function ProtectedRoute({ children }) {
  const { user, loading, loginPreviewDriver } = useAuth();
  const attemptedPreviewLogin = useRef(false);
  const [previewLoginFailed, setPreviewLoginFailed] = useState(false);
  const [previewLoginPending, setPreviewLoginPending] = useState(false);
  const previewHome = import.meta.env.DEV && window.location.pathname === "/";

  useEffect(() => {
    if (!previewHome || loading || user?.role === "driver" || attemptedPreviewLogin.current) return;
    attemptedPreviewLogin.current = true;
    setPreviewLoginPending(true);
    loginPreviewDriver()
      .catch(() => setPreviewLoginFailed(true))
      .finally(() => setPreviewLoginPending(false));
  }, [previewHome, loading, user, loginPreviewDriver]);

  if (loading || (previewHome && user?.role !== "driver" && !previewLoginFailed &&
      (!attemptedPreviewLogin.current || previewLoginPending))) {
    return <FullScreenLoader />;
  }

  if (previewHome && previewLoginFailed) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
