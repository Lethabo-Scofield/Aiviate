import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "aiviate_token";
const USER_KEY = "aiviate_user";
const LOCAL_DEMO_TOKEN = "local-demo-token";
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const LOCAL_DEMO_ENABLED = import.meta.env.DEV;

const LOCAL_DEMO_USER = {
  id: "USR-LOCAL-DEMO",
  email: "demo@aiviate.io",
  name: "Demo Dispatcher",
  role: "admin",
  company_id: "CMP-LOCAL-DEMO",
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [loading, setLoading] = useState(true);

  const saveAuth = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, []);

  const logout = useCallback(() => {
    saveAuth(null, null);
  }, [saveAuth]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    if (token === LOCAL_DEMO_TOKEN && LOCAL_DEMO_ENABLED) {
      // A stale offline-demo session. Now that the backend is reachable, try to
      // upgrade it to a real backend demo session so real data (jobs, drivers,
      // engine plans) shows. Fall back to the offline demo if the backend is down.
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      fetch(`${API_BASE}/auth/demo-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.token && data.user) {
            saveAuth(data.token, data.user);
          }
        })
        .catch(() => {})
        .finally(() => {
          window.clearTimeout(timeout);
          setLoading(false);
        });
      return;
    }
    if (token === LOCAL_DEMO_TOKEN) {
      logout();
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          logout();
          return null;
        }
        if (!res.ok) return null;
        return res.text().then((text) => {
          try { return JSON.parse(text); } catch { return null; }
        });
      })
      .then((data) => {
        if (data && data.user) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }
      })
      .catch(() => {
      })
      .finally(() => setLoading(false));
  }, []);

  const parseJSON = async (res) => {
    if (res.status === 0 || res.type === "opaque") {
      throw new Error("Unable to reach the server. Please check your connection.");
    }
    const text = await res.text();
    if (!text) throw new Error("Empty response from server. The backend may be starting up — please try again.");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Unexpected server response");
    }
  };

  const login = async (email, password) => {
    const trimmedEmail = (email || "").trim().toLowerCase();
    const isDemoShortcut =
      (trimmedEmail === "demo" || trimmedEmail === "demo@aiviate.io") &&
      (password || "") === "demo";
    if (isDemoShortcut) {
      return loginDemo();
    }
    let res;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error("Cannot connect to server. Please check that the backend is running.");
    }
    const data = await parseJSON(res);
    if (!res.ok) throw new Error(data.error || "Login failed");
    saveAuth(data.token, data.user);
    return data.user;
  };

  const loginDemo = async () => {
    let res;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    try {
      res = await fetch(`${API_BASE}/auth/demo-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
    } catch {
      if (LOCAL_DEMO_ENABLED) {
        saveAuth(LOCAL_DEMO_TOKEN, LOCAL_DEMO_USER);
        return LOCAL_DEMO_USER;
      }
      throw new Error("Cannot connect to server. Please check that the backend is running.");
    } finally {
      window.clearTimeout(timeout);
    }
    const data = await parseJSON(res);
    if (!res.ok) throw new Error(data.error || "Demo login failed");
    saveAuth(data.token, data.user);
    return data.user;
  };

  const register = async (name, email, password, companyName) => {
    let res;
    try {
      res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, company_name: companyName }),
      });
    } catch {
      throw new Error("Cannot connect to server. Please check that the backend is running.");
    }
    const data = await parseJSON(res);
    if (!res.ok) throw new Error(data.error || "Registration failed");
    saveAuth(data.token, data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginDemo, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
