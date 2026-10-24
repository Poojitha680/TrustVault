import React from 'react';
import { useAuth, TEST_PERSONAS } from '../context/AuthContext';
import { Shield, ShieldCheck, LogOut, UserCheck, AlertTriangle, Activity } from 'lucide-react';

interface NavbarProps {
  activeTab: 'vault' | 'audit' | 'threats';
  setActiveTab: (tab: 'vault' | 'audit' | 'threats') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, logout, switchPersona } = useAuth();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-900/60 text-purple-300 border border-purple-700/50">Admin</span>;
      case 'owner':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-sky-900/60 text-sky-300 border border-sky-700/50">Doc Owner</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">Viewer</span>;
    }
  };

  return (
    <header className="border-b border-vault-border bg-vault-900/90 backdrop-blur sticky top-0 z-40">
      {/* Persona Quick Switcher Bar for Live Security Demo */}
      <div className="bg-vault-950 border-b border-vault-border/60 px-4 py-1.5 text-xs flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2 text-slate-400">
          <Activity className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
          <span className="font-medium text-slate-300">Live Persona Testing:</span>
          <span className="hidden sm:inline text-slate-500">Switch personas to test cross-user isolation & instant revocation:</span>
        </div>
        <div className="flex items-center space-x-1.5 overflow-x-auto">
          {TEST_PERSONAS.map(p => {
            const isCurrent = user?.username === p.id;
            return (
              <button
                key={p.id}
                onClick={() => switchPersona(p.id)}
                className={`px-2.5 py-1 rounded text-xs transition-all flex items-center space-x-1.5 ${
                  isCurrent
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50 font-semibold shadow-sm'
                    : 'bg-vault-850 text-slate-400 hover:text-slate-200 hover:bg-vault-800 border border-vault-border/80'
                }`}
                title={`${p.name} (${p.title}): ${p.description}`}
              >
                <span>{p.name.split(' ')[0]}</span>
                <span className="text-[10px] opacity-70">({p.role})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('vault')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 ring-1 ring-white/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold tracking-tight text-white font-sans">TrustVault</span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800/60 font-semibold">
                  Zero-Trust
                </span>
              </div>
              <p className="text-[11px] text-slate-400 tracking-wide">High-Assurance Confidential Document Vault</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('vault')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'vault'
                  ? 'bg-vault-800 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-vault-850'
              }`}
            >
              Document Vault
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-1.5 ${
                activeTab === 'audit'
                  ? 'bg-vault-800 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-vault-850'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Audit & Security</span>
            </button>
            <button
              onClick={() => setActiveTab('threats')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-1.5 ${
                activeTab === 'threats'
                  ? 'bg-vault-800 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-vault-850'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Threat Matrix & Spec</span>
            </button>
          </nav>
        </div>

        {/* User Badge & Actions */}
        <div className="flex items-center space-x-3">
          {user && (
            <div className="flex items-center space-x-3 bg-vault-850/80 border border-vault-border rounded-xl px-3 py-1.5">
              <div className="w-8 h-8 rounded-lg bg-vault-700 flex items-center justify-center text-slate-200 font-bold text-xs ring-1 ring-white/10">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-slate-200">{user.full_name}</span>
                  {getRoleBadge(user.role)}
                </div>
                <div className="text-[11px] font-mono text-slate-400">@{user.username}</div>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50 transition-colors"
            title="Immediate Logout (Revoke Session Token)"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
