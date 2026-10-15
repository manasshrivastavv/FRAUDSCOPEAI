import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  ArrowRight,
  ShieldCheck,
  Building2,
  Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/ui/Logo';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'Investigator' | 'Fraud Analyst' | 'Developer'>('Investigator');
  const [agreeTerms, setAgreeTerms] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Validation checks
  const isLengthValid = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim() || !email.trim() || !username.trim() || !password) {
      setErrorMsg('All registration fields are required.');
      return;
    }

    if (!isLengthValid || !hasUpper || !hasDigit) {
      setErrorMsg('Password does not meet cybersecurity strength criteria.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Password confirmation does not match the chosen password.');
      return;
    }

    if (!agreeTerms) {
      setErrorMsg('You must acknowledge the investigation terms and privacy policy.');
      return;
    }

    setLoading(true);
    try {
      const newUser = await register({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        username: username.trim().toLowerCase(),
        password,
        confirm_password: confirmPassword,
        role,
      });

      setSuccessMsg(
        `Account created successfully for ${newUser.username}! Redirecting to login...`
      );
      setTimeout(() => {
        navigate('/login', {
          state: {
            registeredEmail: email.trim().toLowerCase(),
            message: 'Registration complete. Please sign in with your credentials.',
          },
        });
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4 sm:p-6 lg:p-10 investigation-grid">
      <div className="w-full max-w-4xl bg-[#FFFFFF] rounded-2xl border border-[#E8DDB8] shadow-gold-lg overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Brand Identity Rail (4 cols) */}
        <div className="lg:col-span-5 bg-[#FFFDF7] p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-[#E8DDB8] flex flex-col justify-between relative">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#D4AF37]" />

          <div>
            {/* Official Logo */}
            <div className="mb-6">
              <Link to="/">
                <Logo size="lg" />
              </Link>
            </div>

            <div className="inline-block px-2.5 py-1 rounded bg-[#F5EAC2] text-[#A67C00] font-mono text-[11px] font-bold uppercase tracking-wider mb-4 border border-[#E8DDB8]">
              Account Provisioning
            </div>

            <h1 className="text-2xl font-bold text-[#202124] tracking-tight mb-2">
              Join FRAUDSCOPE AI
            </h1>
            <p className="text-sm text-[#697386] leading-relaxed mb-6">
              Empowering financial analysts and cybercrime investigators to proactively detect, dissect, and map fraudulent financial ad campaigns.
            </p>

            {/* Feature highlights */}
            <div className="space-y-3.5 pt-4 border-t border-[#E8DDB8]/70">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#FAF9F6] border border-[#E8DDB8] flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#A67C00]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#202124]">High-Precision Ad Scanner</p>
                  <p className="text-[11px] text-[#697386]">Hybrid Character n-Gram & Rule-Based Engine</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#FAF9F6] border border-[#E8DDB8] flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 className="w-3.5 h-3.5 text-[#A67C00]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#202124]">Threat Network Graph</p>
                  <p className="text-[11px] text-[#697386]">Connected UPI IDs, WhatsApp, and Telegram syndicates</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#FAF9F6] border border-[#E8DDB8] flex items-center justify-center shrink-0 mt-0.5">
                  <Briefcase className="w-3.5 h-3.5 text-[#A67C00]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#202124]">Tamper-Proof Audit Trail</p>
                  <p className="text-[11px] text-[#697386]">Argon2 / Bcrypt secure credential storage</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-8 border-t border-[#E8DDB8]/70 text-[11px] text-[#697386]">
            FRAUDSCOPE AI Platform • Version 2.0 • ISO 27001 Compliant Audit Standards
          </div>
        </div>

        {/* Right Registration Form Area (7 cols) */}
        <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#202124]">Create Your Account</h2>
            <p className="text-xs text-[#697386] mt-1">
              Join FRAUDSCOPE AI to investigate suspicious financial advertisements.
            </p>
          </div>

          {/* Success Banner */}
          {successMsg && (
            <div className="mb-5 p-3.5 rounded-lg bg-[rgba(35,134,91,0.08)] border border-[rgba(35,134,91,0.3)] flex items-start gap-2.5 text-xs text-[#23865B]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-lg bg-[rgba(200,61,77,0.08)] border border-[rgba(200,61,77,0.3)] flex items-start gap-2.5 text-xs text-[#C83D4D]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-medium text-[#202124] mb-1">
                Full Name <span className="text-[#C83D4D]">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8C97A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="e.g. Maya Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="gold-input w-full pl-9 pr-3 py-2 text-xs"
                  required
                />
              </div>
            </div>

            {/* Email & Username Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#202124] mb-1">
                  Email Address <span className="text-[#C83D4D]">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#8C97A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="analyst@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="gold-input w-full pl-9 pr-3 py-2 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#202124] mb-1">
                  Username <span className="text-[#C83D4D]">*</span>
                </label>
                <div className="relative">
                  <span className="text-[#8C97A8] text-xs font-mono absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    @
                  </span>
                  <input
                    type="text"
                    placeholder="m_sharma"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="gold-input w-full pl-8 pr-3 py-2 text-xs font-mono"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-xs font-medium text-[#202124] mb-1">
                Authorized Role <span className="text-[#C83D4D]">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRole('Investigator')}
                  className={`p-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-all ${
                    role === 'Investigator'
                      ? 'border-[#D4AF37] bg-[#FFFDF7] text-[#202124] ring-1 ring-[#D4AF37]'
                      : 'border-[#E8DDB8] bg-[#FFFFFF] text-[#697386] hover:bg-[#FAF9F6]'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-xs">Investigator</p>
                    <p className="text-[10px] text-[#697386]">Case creation & inquiries</p>
                  </div>
                  {role === 'Investigator' && <Check className="w-4 h-4 text-[#A67C00] shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => setRole('Fraud Analyst')}
                  className={`p-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-all ${
                    role === 'Fraud Analyst'
                      ? 'border-[#D4AF37] bg-[#FFFDF7] text-[#202124] ring-1 ring-[#D4AF37]'
                      : 'border-[#E8DDB8] bg-[#FFFFFF] text-[#697386] hover:bg-[#FAF9F6]'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-xs">Fraud Analyst</p>
                    <p className="text-[10px] text-[#697386]">Scanner triage & analysis</p>
                  </div>
                  {role === 'Fraud Analyst' && <Check className="w-4 h-4 text-[#A67C00] shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => setRole('Developer')}
                  className={`p-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-all ${
                    role === 'Developer'
                      ? 'border-[#D4AF37] bg-[#FFFDF7] text-[#202124] ring-1 ring-[#D4AF37]'
                      : 'border-[#E8DDB8] bg-[#FFFFFF] text-[#697386] hover:bg-[#FAF9F6]'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-xs">Developer</p>
                    <p className="text-[10px] text-[#697386]">API integration & models</p>
                  </div>
                  {role === 'Developer' && <Check className="w-4 h-4 text-[#A67C00] shrink-0" />}
                </button>
              </div>
              <p className="text-[10px] text-[#697386] mt-1 italic">
                * Note: Administrator privileges are restricted and assigned through authorized root delegation.
              </p>
            </div>

            {/* Password & Confirm Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#202124] mb-1">
                  Password <span className="text-[#C83D4D]">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#8C97A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="gold-input w-full pl-9 pr-9 py-2 text-xs"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C97A8] hover:text-[#202124]"
                    aria-label="Toggle password view"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#202124] mb-1">
                  Confirm Password <span className="text-[#C83D4D]">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#8C97A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="gold-input w-full pl-9 pr-9 py-2 text-xs"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C97A8] hover:text-[#202124]"
                    aria-label="Toggle confirm password view"
                  >
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Password Criteria Checklist */}
            <div className="p-3 bg-[#FAF9F6] rounded-lg border border-[#E8DDB8] text-[11px] grid grid-cols-3 gap-2">
              <span className={`flex items-center gap-1.5 ${isLengthValid ? 'text-[#23865B] font-medium' : 'text-[#8C97A8]'}`}>
                <Check className={`w-3.5 h-3.5 ${isLengthValid ? 'text-[#23865B]' : 'opacity-30'}`} />
                8+ Characters
              </span>
              <span className={`flex items-center gap-1.5 ${hasUpper ? 'text-[#23865B] font-medium' : 'text-[#8C97A8]'}`}>
                <Check className={`w-3.5 h-3.5 ${hasUpper ? 'text-[#23865B]' : 'opacity-30'}`} />
                Uppercase Letter
              </span>
              <span className={`flex items-center gap-1.5 ${hasDigit ? 'text-[#23865B] font-medium' : 'text-[#8C97A8]'}`}>
                <Check className={`w-3.5 h-3.5 ${hasDigit ? 'text-[#23865B]' : 'opacity-30'}`} />
                At least 1 Number
              </span>
            </div>

            {/* Terms and Privacy Checkbox */}
            <div className="flex items-start gap-2.5 pt-1">
              <input
                id="terms"
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 rounded border-[#E8DDB8] text-[#A67C00] focus:ring-[#D4AF37]"
              />
              <label htmlFor="terms" className="text-xs text-[#697386] leading-tight select-none">
                I agree to the <span className="text-[#A67C00] underline font-medium">Investigative Use Policy</span> and acknowledge that forensic scans are subject to supervisory audit logs.
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full py-2.5 text-xs font-semibold uppercase tracking-wider mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Registering Account in Database...</span>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Already have an account link */}
          <div className="mt-6 pt-4 border-t border-[#E8DDB8] text-center text-xs text-[#697386]">
            Already have an account?{' '}
            <Link to="/login" className="text-[#A67C00] hover:text-[#8C6700] font-semibold underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
