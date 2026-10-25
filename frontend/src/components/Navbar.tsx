import React from 'react';
import { useAuth, TEST_PERSONAS } from '../context/AuthContext';
import { Shield, ShieldCheck, LogOut, AlertTriangle, Activity } from 'lucide-react';

interface NavbarProps {
  activeTab: 'vault' | 'audit' | 'threats';
  setActiveTab: (tab: 'vault' | 'audit' | 'threats') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, logout, switchPersona } = useAuth();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#1C314E] text-[#93C5FD] border border-[#2563EB]/40">
            Admin
          </span>
        );
      case 'owner':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#0F766E]/30 text-[#5EEAD4] border border-[#0F766E]">
            Doc Owner
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#1C314E] text-[#CBD5E1] border border-[#334873]">
            Viewer
          </span>
        );
    }
  };

  return (
    <header className="border-b border-[#1C314E] bg-[#14243A] text-white sticky top-0 z-40 shadow-sm">
      {/* Persona Quick Switcher Bar for Live Security Evaluation */}
      <div className="bg-[#0E1A2B] border-b border-[#1C314E] px-4 py-2 text-xs flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2 text-[#94A3B8]">
          <Activity className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
          <span className="font-semibold text-[#E2E8F0]">Persona Testing Bar:</span>
          <span className="hidden sm:inline text-[#94A3B8]">
            Switch identity to test cross-user document isolation and permissions:
          </span>
        </div>
        <div className="flex items-center space-x-1.5 overflow-x-auto">
          {TEST_PERSONAS.map(p => {
            const isCurrent = user?.username === p.id;
            return (
              <button
                key={p.id}
                onClick={() => switchPersona(p.id)}
                className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center space-x-1.5 font-medium ${
                  isCurrent
                    ? 'bg-[#2563EB] text-white shadow-sm'
                    : 'bg-[#14243A] text-[#CBD5E1] hover:text-white hover:bg-[#1C314E] border border-[#1C314E]'
                }`}
                title={`${p.name} (${p.title}): ${p.description}`}
              >
                <span>{p.name.split(' ')[0]}</span>
                <span className="text-[10px] opacity-75">({p.role})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-8">
          <div
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => setActiveTab('vault')}
          >
            <div className="w-9 h-9 rounded-lg bg-[#2563EB] flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-white">TrustVault</span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0F766E] text-white font-medium">
                  Zero-Trust
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8]">High-Assurance Confidential Document Vault</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('vault')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'vault'
                  ? 'bg-[#1C314E] text-white border border-[#2563EB]/50'
                  : 'text-[#CBD5E1] hover:text-white hover:bg-[#1C314E]/60'
              }`}
            >
              Document Vault
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'audit'
                  ? 'bg-[#1C314E] text-white border border-[#0F766E]/60'
                  : 'text-[#CBD5E1] hover:text-white hover:bg-[#1C314E]/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-[#5EEAD4]" />
              <span>Audit & Security</span>
            </button>
            <button
              onClick={() => setActiveTab('threats')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                activeTab === 'threats'
                  ? 'bg-[#1C314E] text-white border border-[#CBD5E1]/30'
                  : 'text-[#CBD5E1] hover:text-white hover:bg-[#1C314E]/60'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-[#FDE68A]" />
              <span>Threat Matrix & Spec</span>
            </button>
          </nav>
        </div>

        {/* User Badge & Logout */}
        <div className="flex items-center space-x-3">
          {user && (
            <div className="flex items-center space-x-3 bg-[#1C314E] border border-[#2A4368] rounded-lg px-3 py-1.5">
              <div className="w-7 h-7 rounded-md bg-[#2563EB] flex items-center justify-center text-white font-bold text-xs">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-white">{user.full_name}</span>
                  {getRoleBadge(user.role)}
                </div>
                <div className="text-[11px] font-mono text-[#94A3B8]">@{user.username}</div>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            className="p-2 rounded-lg text-[#CBD5E1] hover:text-[#FECACA] hover:bg-[#B91C1C]/20 border border-transparent transition-colors"
            title="Immediate Logout (Revoke Session Token)"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
