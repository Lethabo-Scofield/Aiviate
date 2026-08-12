import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LogIn, Eye, EyeOff, Sparkles } from "lucide-react";

export default function Login() {
  const { login, loginDemo, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError("");
    setDemoLoading(true);
    try {
      await loginDemo();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <img src="/logo.png" alt="Aiviate" className="w-14 h-14" />
          </div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Aiviate</h1>
          <p className="text-[15px] text-[#868E96] mt-1">The AI operations brain for your fleet.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-[#ff3b30]/[0.06]">
              <p className="text-[13px] text-[#ff3b30]">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-[#111315] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              className="apple-input"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#111315] mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className="apple-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c7c7cc] hover:text-[#868E96] transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || demoLoading}
            className="apple-btn apple-btn-primary w-full mt-1"
          >
            {loading ? (
              <img src="/logo.png" alt="" className="w-4 h-4 animate-logo-pulse brightness-0 invert" />
            ) : (
              <LogIn size={16} />
            )}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-black/[0.06]" />
          <span className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold">or</span>
          <div className="flex-1 h-px bg-black/[0.06]" />
        </div>

        <button
          type="button"
          onClick={handleDemo}
          disabled={loading || demoLoading}
          className="apple-btn apple-btn-secondary w-full"
        >
          <Sparkles size={15} />
          {demoLoading ? "Loading demo..." : "Try the demo"}
        </button>
        <p className="text-center text-[11px] text-[#ADB5BD] mt-2">
          Or sign in with <span className="font-mono text-[#868E96]">demo</span> / <span className="font-mono text-[#868E96]">demo</span>
        </p>

        <p className="text-center mt-6 text-[13px] text-[#868E96]">
          Don't have an account?{" "}
          <Link to="/register" className="text-[#111315] font-semibold hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
