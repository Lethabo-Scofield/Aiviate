import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { UserPlus, Eye, EyeOff } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password, companyName);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <img src="/logo.png" alt="Aiviate" className="w-14 h-14" />
          </div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold text-[#111315] tracking-tight">Get started</h1>
          <p className="text-[15px] text-[#868E96] mt-1">Create your dispatch account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-[#343A40]/[0.06]">
              <p className="text-[13px] text-[#343A40]">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-[#111315] mb-1.5">Company name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="Acme Logistics"
              className="apple-input"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#111315] mb-1.5">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="John Doe"
              className="apple-input"
            />
          </div>

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
                placeholder="At least 6 characters"
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
            disabled={loading}
            className="apple-btn apple-btn-primary w-full mt-1"
          >
            {loading ? (
              <img src="/logo.png" alt="" className="w-4 h-4 animate-logo-pulse brightness-0 invert" />
            ) : (
              <UserPlus size={16} />
            )}
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center mt-6 text-[13px] text-[#868E96]">
          Already have an account?{" "}
          <Link to="/login" className="text-[#111315] font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
