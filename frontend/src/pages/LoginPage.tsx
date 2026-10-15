import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/ui/Logo';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const stateData = location.state as { from?: { pathname: string }; registeredEmail?: string; message?: string } | null;

  const [identifier, setIdentifier] = useState(stateData?.registeredEmail || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(stateData?.message || null);

  useEffect(() => {
    if (stateData?.registeredEmail) {
      setIdentifier(stateData.registeredEmail);
    }
    if (stateData?.message) {
      setInfoMsg(stateData.message);
    }
  }, [stateData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!identifier.trim() || !password) {
      setErrorMsg('Please enter both your email address/username and password.');
      return;
    }

    setLoading(true);
    try {
      await login({
        username_or_email: identifier.trim(),
        password,
      });

      const redirectPath = stateData?.from?.pathname || '/console';
      navigate(redirectPath, { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid credentials. Please verify your username and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4 sm:p-6 lg:p-10 investigation-grid">
      <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl border border-[#E8DDB8] shadow-gold-lg overflow-hidden relative">
        {/* Restrained Metallic Gold Top Accent Bar */}
        <div className="h-1.5 bg-gradient-to-r from-[#D4AF37] via-[#A67C00] to-[#D4AF37]" />

        <div className="p-8 sm:p-9 space-y-6">
          {/* Brand Header with Official Logo */}
          <div className="text-center flex flex-col items-center">
            <Link to="/" className="inline-block mb-3.5 hover:opacity-95 transition-opacity">
              <Logo size="lg" />
            </Link>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FFFDF7] border border-[#E8DDB8] text-[10px] font-mono uppercase tracking-wider text-[#A67C00] font-semibold mb-2">
              <ShieldCheck className="w-3 h-3 text-[#A67C00]" />
              <span>Fraud Intelligence Platform</span>
            </div>

            <h1 className="text-2xl font-bold text-[#202124] tracking-tight">
              Welcome Back
            </h1>
            <p className="text-xs text-[#697386] mt-1">
              Sign in to continue to your fraud intelligence workspace.
            </p>
          </div>

          {/* Info Banner (e.g. from registration redirect) */}
          {infoMsg && (
            <div className="p-3 rounded-lg bg-[rgba(35,134,91,0.08)] border border-[rgba(35,134,91,0.25)] flex items-start gap-2.5 text-xs text-[#23865B]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-[rgba(200,61,77,0.08)] border border-[rgba(200,61,77,0.25)] flex items-start gap-2.5 text-xs text-[#C83D4D]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#202124] mb-1.5">
                Email Address or Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8C97A8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="investigator or user@domain.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="gold-input w-full pl-10 pr-3 py-2.5 text-xs font-mono"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#202124]">
                  Password
                </label>
                <span className="text-[11px] text-[#697386] italic">
                  Case sensitive
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8C97A8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="gold-input w-full pl-10 pr-10 py-2.5 text-xs font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8C97A8] hover:text-[#202124] transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full py-2.5 text-xs font-semibold uppercase tracking-wider mt-1 flex items-center justify-center gap-2 shadow-md"
            >
              {loading ? (
                <span>Verifying Credentials...</span>
              ) : (
                <>
                  <span>Sign In to Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Registration Link & Return to Showcase */}
          <div className="pt-4 border-t border-[#E8DDB8] space-y-2 text-center text-xs">
            <p className="text-[#697386]">
              Don't have an investigator account?{' '}
              <Link to="/register" className="text-[#A67C00] hover:text-[#8C6700] font-semibold underline">
                Create Account
              </Link>
            </p>

            <div>
              <Link to="/" className="text-[11px] text-[#697386] hover:text-[#202124] transition-colors inline-flex items-center gap-1">
                ← Return to Public Showcase
              </Link>
            </div>
          </div>
        </div>

        {/* Security Footer Note */}
        <div className="bg-[#FAF9F6] border-t border-[#E8DDB8] py-2 px-6 text-center text-[10px] text-[#8C97A8]">
          Protected by AES-256 JWT & Argon2id/Bcrypt Authentication Protocol
        </div>
      </div>
    </div>
  );
};
