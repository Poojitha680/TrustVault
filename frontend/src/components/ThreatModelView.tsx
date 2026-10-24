import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Cpu,
  Layers,
  FileCheck2,
  AlertTriangle,
  Server,
  KeyRound,
  EyeOff,
  Clock,
} from 'lucide-react';

export const ThreatModelView: React.FC = () => {
  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center space-x-2.5">
          <Layers className="w-6 h-6 text-sky-400" />
          <span>TrustVault Threat Model & Security Architecture Matrix</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Formally analyzed security boundaries, adversary models, cryptographic invariants, and mitigation controls
        </p>
      </div>

      {/* Adversary & Threat Scenario Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Threat 1: Cross-User Document IDOR */}
        <div className="p-5 rounded-2xl bg-vault-900 border border-vault-border space-y-2.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <EyeOff className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Insecure Direct Object Reference (IDOR)</h4>
              <span className="text-[10px] font-mono text-rose-400 uppercase font-bold">Threat: Critical</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong>Adversary Goal:</strong> Attacker probes URL IDs (<code>/api/documents/1/download</code>) to exfiltrate documents belonging to other users.
          </p>
          <div className="p-2.5 rounded-xl bg-vault-950 border border-vault-border/80 text-xs text-emerald-300">
            <strong>TrustVault Defense:</strong> Strict server-side authorization checkpoint in <code>authz.py</code>. Query enforces owner identity or active explicit grant in <code>document_permissions</code>. Non-authorized access is synchronously blocked (HTTP 403) and logged as a security alert.
          </div>
        </div>

        {/* Threat 2: Administrator Privilege Creep */}
        <div className="p-5 rounded-2xl bg-vault-900 border border-vault-border space-y-2.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Administrator Privilege Escalation & Snooping</h4>
              <span className="text-[10px] font-mono text-amber-400 uppercase font-bold">Threat: High</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong>Adversary Goal:</strong> Platform Administrator leverages administrative status to read confidential documents (e.g. executive payroll, patent blueprints).
          </p>
          <div className="p-2.5 rounded-xl bg-vault-950 border border-vault-border/80 text-xs text-emerald-300">
            <strong>TrustVault Defense:</strong> Separation of duties. The Administrator role grants oversight over metadata, aggregate metrics, and audit chains, but strictly CANNOT download confidential document bytes without an explicit grant from the owner.
          </div>
        </div>

        {/* Threat 3: Delayed Revocation / Zombie Tokens */}
        <div className="p-5 rounded-2xl bg-vault-900 border border-vault-border space-y-2.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Zombie Permissions & Stale Caching</h4>
              <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold">Threat: High</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong>Adversary Goal:</strong> Compromised user continues to download confidential files using cached credentials or un-invalidated permissions after being revoked.
          </p>
          <div className="p-2.5 rounded-xl bg-vault-950 border border-vault-border/80 text-xs text-emerald-300">
            <strong>TrustVault Defense:</strong> Real-time zero-delay enforcement. Every request checks the source of truth database. Revoking a grant immediately denies the subsequent request (proven in automated tests). Zero-cache headers (<code>Cache-Control: no-store</code>) prevent disk caching.
          </div>
        </div>

        {/* Threat 4: Audit Log Modification or Deletion */}
        <div className="p-5 rounded-2xl bg-vault-900 border border-vault-border space-y-2.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Log Tampering, Insertion or Deletion</h4>
              <span className="text-[10px] font-mono text-sky-400 uppercase font-bold">Threat: Critical</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong>Adversary Goal:</strong> Malicious actor modifies, retrofits, or deletes audit records to cover up unauthorized access attempts.
          </p>
          <div className="p-2.5 rounded-xl bg-vault-950 border border-vault-border/80 text-xs text-emerald-300">
            <strong>TrustVault Defense:</strong> Dual barrier: 1) SQLite database triggers prohibit <code>UPDATE</code> and <code>DELETE</code> operations on <code>audit_logs</code>; 2) HMAC-SHA256 unbroken sequence chaining detects any discrepancy during independent cryptographic verification.
          </div>
        </div>
      </div>

      {/* Security Architecture & Guarantees */}
      <div className="p-6 rounded-2xl bg-vault-900 border border-vault-border space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Core Security Invariants & Cryptographic Profile</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-vault-950 border border-vault-border/70 space-y-1.5">
            <div className="text-sky-400 font-semibold flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>AES-256-GCM Storage</span>
            </div>
            <p className="text-slate-400">
              Every document is encrypted at rest with a 256-bit key using Galois/Counter Mode. Authenticated tag guarantees ciphertext integrity against tampering.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-vault-950 border border-vault-border/70 space-y-1.5">
            <div className="text-emerald-400 font-semibold flex items-center space-x-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Argon2id Authentication</span>
            </div>
            <p className="text-slate-400">
              Password credentials hashed with RFC 9106 recommended Argon2id profile (64 MB memory cost, 2 iterations). Sliding-window rate limiting halts brute-force attacks.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-vault-950 border border-vault-border/70 space-y-1.5">
            <div className="text-amber-400 font-semibold flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5" />
              <span>AI Safety Invariant</span>
            </div>
            <p className="text-slate-400">
              AI access recommendation engine is strictly advisory. Machines never alter permissions autonomously. Explicit human owner confirmation required for every grant.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
