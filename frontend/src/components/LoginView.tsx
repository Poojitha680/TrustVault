import React, { useState } from 'react';
import { useAuth, TEST_PERSONAS } from '../context/AuthContext';
import { Shield, Lock, User, Mail, AlertCircle, CheckCircle2, ArrowRight, KeyRound, UserPlus, LogIn } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, register, error, clearError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login form state
  const [username, setUsername] = useState('alice_owner');
  const [password, setPassword] = useState('OwnerPassword123!');
  const [submitting, setSubmitting] = useState(false);

  // Registration form state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [clientValidationErr, setClientValidationErr] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    setClientValidationErr(null);
    try {
      await login(username.trim(), password);
    } catch {
      // Error handled by AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const validateRegistration = (): string | null => {
    if (regFullName.trim().length < 2) {
      return 'Full name must be at least 2 characters.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail.trim())) {
      return 'Please enter a valid email address.';
    }
    if (regUsername.trim().length < 3) {
      return 'Username must be at least 3 characters.';
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(regUsername.trim())) {
      return 'Username may only contain letters, numbers, hyphens, and underscores.';
    }
    if (regPassword.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (!/[A-Z]/.test(regPassword)) {
      return 'Password must contain at least one uppercase letter.';
    }
    if (!/[a-z]/.test(regPassword)) {
      return 'Password must contain at least one lowercase letter.';
    }
    if (!/[0-9]/.test(regPassword)) {
      return 'Password must contain at least one digit.';
    }
    return null;
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setClientValidationErr(null);
    setRegSuccess(null);

    const validationMsg = validateRegistration();
    if (validationMsg) {
      setClientValidationErr(validationMsg);
      return;
    }

    setSubmitting(true);
    try {
      await register({
        full_name: regFullName.trim(),
        email: regEmail.trim().toLowerCase(),
        username: regUsername.trim().toLowerCase(),
        password: regPassword,
      });
      setRegSuccess('Account created successfully! Default role: Viewer (Read-Only). Authenticating session...');
    } catch {
      // Error handled by AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectPersona = (personaId: string, personaPass: string) => {
    clearError();
    setClientValidationErr(null);
    setMode('login');
    setUsername(personaId);
    setPassword(personaPass);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-[#14243A] items-center justify-center shadow-md mb-1">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#172033] tracking-tight">TrustVault</h1>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            High-Assurance Confidential Document Platform with Cryptographic Audit Integrity
          </p>
        </div>

        {/* Auth Mode Toggle Tabs */}
        <div className="flex bg-[#E2E8F0] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => {
              clearError();
              setClientValidationErr(null);
              setMode('login');
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
              mode === 'login'
                ? 'bg-white text-[#172033] shadow-sm'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              clearError();
              setClientValidationErr(null);
              setMode('register');
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
              mode === 'register'
                ? 'bg-white text-[#172033] shadow-sm'
                : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>
        </div>

        {/* Card Body */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 sm:p-8 shadow-sm">
          {/* Messages */}
          {(error || clientValidationErr) && (
            <div className="mb-4 p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-xs flex items-start space-x-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#B91C1C]" />
              <span>{clientValidationErr || error}</span>
            </div>
          )}

          {regSuccess && (
            <div className="mb-4 p-3.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] text-xs flex items-start space-x-2.5 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#15803D]" />
              <span>{regSuccess}</span>
            </div>
          )}

          {mode === 'login' ? (
            /* Sign In Form */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5">Username</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-[#64748B]" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => {
                      clearError();
                      setUsername(e.target.value);
                    }}
                    placeholder="Enter your username"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-[#64748B]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => {
                      clearError();
                      setPassword(e.target.value);
                    }}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Argon2id Hash...</span>
                  </>
                ) : (
                  <>
                    <span>Authenticate Session</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Registration Form */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="p-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-[11px] text-[#1E40AF]">
                <span className="font-semibold">Default Role Assignment:</span> All public registrations are securely assigned the <strong>Viewer (Read-Only)</strong> role. Administrative roles cannot be self-selected.
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B]" />
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={e => {
                      setClientValidationErr(null);
                      setRegFullName(e.target.value);
                    }}
                    placeholder="e.g. Eleanor Vance"
                    className="w-full pl-9 pr-3.5 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B]" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={e => {
                      setClientValidationErr(null);
                      setRegEmail(e.target.value);
                    }}
                    placeholder="name@organization.com"
                    className="w-full pl-9 pr-3.5 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">Username</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B]" />
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={e => {
                      setClientValidationErr(null);
                      setRegUsername(e.target.value);
                    }}
                    placeholder="e.g. eleanor_viewer"
                    className="w-full pl-9 pr-3.5 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B]" />
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={e => {
                      setClientValidationErr(null);
                      setRegPassword(e.target.value);
                    }}
                    placeholder="Min 8 chars with upper, lower & digit"
                    className="w-full pl-9 pr-3.5 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
                  />
                </div>
                <div className="mt-1 flex items-center space-x-2 text-[10px] text-[#64748B]">
                  <span className={regPassword.length >= 8 ? 'text-[#15803D] font-medium' : ''}>&bull; 8+ chars</span>
                  <span className={/[A-Z]/.test(regPassword) ? 'text-[#15803D] font-medium' : ''}>&bull; Uppercase</span>
                  <span className={/[a-z]/.test(regPassword) ? 'text-[#15803D] font-medium' : ''}>&bull; Lowercase</span>
                  <span className={/[0-9]/.test(regPassword) ? 'text-[#15803D] font-medium' : ''}>&bull; Number</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer mt-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Registering with Argon2id...</span>
                  </>
                ) : (
                  <>
                    <span>Create Secure Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Persona Evaluator */}
          <div className="mt-6 pt-5 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center space-x-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Quick Persona Evaluation</span>
              </span>
              <span className="text-[10px] text-[#94A3B8]">1-Click Auto-Fill</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {TEST_PERSONAS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPersona(p.id, p.password)}
                  className={`p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between ${
                    username === p.id && mode === 'login'
                      ? 'bg-[#EFF6FF] border-[#2563EB]'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] hover:bg-white hover:border-[#CBD5E1]'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-[#172033]">{p.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          p.role === 'admin'
                            ? 'bg-[#14243A] text-white'
                            : p.role === 'owner'
                            ? 'bg-[#0F766E] text-white'
                            : 'bg-[#E2E8F0] text-[#172033]'
                        }`}
                      >
                        {p.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] leading-tight">{p.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security Disclaimers */}
        <div className="text-center text-[11px] text-[#64748B] space-y-1">
          <p>Protected by sliding-window rate limiting & constant-time Argon2id password verification.</p>
          <p className="font-mono text-[10px] text-[#94A3B8]">
            Authoritative backend RBAC &bull; Strict Viewer Read-Only Policy Enforced
          </p>
        </div>
      </div>
    </div>
  );
};
