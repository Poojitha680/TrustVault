import React, { useState } from 'react';
import { useAuth, TEST_PERSONAS } from '../context/AuthContext';
import { Shield, Lock, User, AlertCircle, ArrowRight, KeyRound, Sparkles } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, error, clearError } = useAuth();
  const [username, setUsername] = useState('alice_owner');
  const [password, setPassword] = useState('OwnerPassword123!');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch {
      // Error handled by AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectPersona = (personaId: string, personaPass: string) => {
    clearError();
    setUsername(personaId);
    setPassword(personaPass);
  };

  return (
    <div className="min-h-screen bg-vault-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-sky-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[450px] h-[250px] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 items-center justify-center shadow-xl shadow-sky-500/25 ring-1 ring-white/20 mb-1">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">TrustVault</h1>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            High-Assurance Confidential Document Platform with Cryptographic Audit Integrity
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-vault-900/90 border border-vault-border rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2.5 animate-fade-in">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Username</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => {
                    clearError();
                    setUsername(e.target.value);
                  }}
                  placeholder="Enter your username"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-vault-950 border border-vault-border rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => {
                    clearError();
                    setPassword(e.target.value);
                  }}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-vault-950 border border-vault-border rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
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

          {/* Quick Persona Evaluator */}
          <div className="mt-6 pt-6 border-t border-vault-border">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                <span>Quick Persona Evaluation</span>
              </span>
              <span className="text-[10px] text-slate-500">1-Click Auto-Fill</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {TEST_PERSONAS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPersona(p.id, p.password)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                    username === p.id
                      ? 'bg-sky-500/15 border-sky-500/50'
                      : 'bg-vault-950/60 border-vault-border hover:bg-vault-850 hover:border-slate-600'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-slate-200">{p.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          p.role === 'admin'
                            ? 'bg-purple-950 text-purple-300'
                            : p.role === 'owner'
                            ? 'bg-sky-950 text-sky-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {p.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">{p.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security Disclaimers */}
        <div className="text-center text-[11px] text-slate-500 space-y-1">
          <p>Protected by sliding-window rate limiting & constant-time credential verification.</p>
          <p className="font-mono text-[10px] text-slate-600">Zero token storage in localStorage &bull; Server is final authority</p>
        </div>
      </div>
    </div>
  );
};
