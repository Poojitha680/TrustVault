import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../services/api';
import {
  AuditLogEntry,
  AuditVerificationResult,
  SecurityAlert,
  AdminMetrics,
  User,
} from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  RefreshCw,
  Search,
  Lock,
  Users,
  Database,
  FileText,
  UserPlus,
  UserX,
  UserCheck,
  CheckCircle2,
  Clock,
  HardDrive,
  KeyRound,
} from 'lucide-react';

interface AuditDashboardProps {
  currentUserRole?: string;
}

export const AuditDashboard: React.FC<AuditDashboardProps> = ({ currentUserRole }) => {
  const isAdmin = currentUserRole === 'admin';

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [verification, setVerification] = useState<AuditVerificationResult | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // User Management State (Admin)
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'owner' | 'viewer'>('viewer');
  const [newPassword, setNewPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userActionMsg, setUserActionMsg] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [isAdmin]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAdmin) {
        const [met, logs, al, users] = await Promise.all([
          api.getAdminMetrics().catch(() => null),
          api.getAuditTrail().catch(() => []),
          api.getSecurityAlerts().catch(() => []),
          api.listUsers().catch(() => []),
        ]);
        setMetrics(met);
        setAuditLogs(logs);
        setAlerts(al);
        setUsersList(users);
      } else {
        // Document Owner or Viewer viewing available audit logs
        const logs = await api.getAuditTrail().catch(() => []);
        setAuditLogs(logs);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to load audit records.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await api.verifyAuditChain();
      setVerification(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Audit chain verification failed.');
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setUserActionMsg(null);
    setError(null);
    try {
      await api.createUser({
        username: newUsername.trim(),
        email: newEmail.trim(),
        full_name: newFullName.trim(),
        role: newRole,
        password: newPassword,
      });
      setUserActionMsg(`User @${newUsername} successfully provisioned.`);
      setNewUsername('');
      setNewEmail('');
      setNewFullName('');
      setNewPassword('');
      // Refresh user list & metrics
      const users = await api.listUsers();
      setUsersList(users);
      const met = await api.getAdminMetrics();
      setMetrics(met);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to provision user.');
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleUserStatus = async (userId: number, currentActive: boolean) => {
    setUserActionMsg(null);
    setError(null);
    try {
      const res = await api.toggleUserStatus(userId, !currentActive);
      setUserActionMsg(res.message);
      const users = await api.listUsers();
      setUsersList(users);
      const met = await api.getAdminMetrics();
      setMetrics(met);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to update user status.');
      }
    }
  };

  // Filter logs by search query
  const filteredLogs = auditLogs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.username.toLowerCase().includes(q) ||
      (log.document_title && log.document_title.toLowerCase().includes(q)) ||
      (log.details && log.details.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <span>Cryptographic Security & Audit Integrity</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Immutable HMAC-SHA256 append-only hash chain with database level modification triggers
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {isAdmin && (
            <button
              onClick={() => setShowUserModal(!showUserModal)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-vault-800 text-sky-300 border border-sky-500/30 hover:bg-vault-700 transition-colors flex items-center space-x-1.5"
            >
              <Users className="w-4 h-4" />
              <span>User Accounts ({usersList.length})</span>
            </button>
          )}

          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="p-2 rounded-xl bg-vault-850 hover:bg-vault-800 border border-vault-border text-slate-300 hover:text-white transition-colors"
            title="Refresh Audit Feed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2.5">
          <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {userActionMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-start space-x-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
          <span>{userActionMsg}</span>
        </div>
      )}

      {/* Admin Operational Metrics Cards */}
      {isAdmin && metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-vault-900 border border-vault-border">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Active Users</span>
              <Users className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{metrics.active_users}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{metrics.total_users} total accounts</div>
          </div>

          <div className="p-4 rounded-xl bg-vault-900 border border-vault-border">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Vault Docs</span>
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{metrics.active_documents}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Encrypted at rest</div>
          </div>

          <div className="p-4 rounded-xl bg-vault-900 border border-vault-border">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Encrypted Storage</span>
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">
              {(metrics.storage_bytes / 1024).toFixed(1)} <span className="text-xs font-normal">KB</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">AES-256-GCM authenticated</div>
          </div>

          <div className="p-4 rounded-xl bg-vault-900 border border-vault-border">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Direct Grants</span>
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{metrics.active_permissions}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Across active documents</div>
          </div>

          <div className="p-4 rounded-xl bg-vault-900 border border-vault-border">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Audit Trail</span>
              <Database className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{metrics.total_audit_records}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Cryptographic records</div>
          </div>

          <div className="p-4 rounded-xl bg-vault-900 border border-vault-border">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Refused Probes</span>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-xl font-bold text-rose-400 font-mono">{metrics.security_refusals}</div>
            <div className="text-[10px] text-rose-500/80 mt-0.5">IDOR / Denied events</div>
          </div>
        </div>
      )}

      {/* Cryptographic Hash Chain Verifier Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-vault-900 to-vault-850 border border-emerald-500/30 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Live Cryptographic Audit Hash Chain Verifier</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                HMAC-SHA256
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Recursively computes each block's cryptographic digest from sequence #1 to latest.
              Guarantees zero log deletion, injection, truncation, or modification.
            </p>
          </div>

          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/25 flex items-center space-x-2 transition-all disabled:opacity-50 shrink-0"
          >
            <ShieldCheck className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
            <span>{verifying ? 'Verifying Chain...' : 'Verify Cryptographic Integrity'}</span>
          </button>
        </div>

        {/* Verification Result Display */}
        {verification && (
          <div className="mt-4 pt-4 border-t border-vault-border/80 animate-fade-in">
            {verification.valid ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 space-y-2">
                <div className="flex items-center space-x-2 text-emerald-300 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>100% Cryptographic Integrity Confirmed &bull; Zero Discrepancies</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300 font-mono">
                  <div>
                    <span className="text-slate-500">Verified Sequences:</span> 1 through #{verification.last_verified_sequence} ({verification.total_records} records)
                  </div>
                  <div className="truncate">
                    <span className="text-slate-500">Latest Digest:</span> {verification.latest_chain_hash}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 space-y-2">
                <div className="flex items-center space-x-2 text-rose-300 text-xs font-semibold">
                  <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>INTEGRITY FAILURE: Tampering or Discontinuity Detected</span>
                </div>
                <p className="text-xs text-rose-200">{verification.reason}</p>
                <div className="text-[11px] font-mono text-slate-400">
                  Corrupted Sequence Block: #{verification.corrupted_sequence}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security Alerts Stream (Admin Only) */}
      {isAdmin && alerts.length > 0 && (
        <div className="p-5 rounded-2xl bg-vault-900 border border-rose-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-300 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Real-Time Security Alerts & Refused Probes ({alerts.length})</span>
            </h3>
            <span className="text-[11px] text-slate-500">Includes IDOR probes & Rate-limit blocks</span>
          </div>

          <div className="border border-vault-border rounded-xl overflow-hidden bg-vault-950 max-h-48 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-vault-850/80 text-slate-400 border-b border-vault-border font-medium">
                <tr>
                  <th className="px-3 py-2">Seq</th>
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Target Document</th>
                  <th className="px-3 py-2">Security Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vault-border/50 text-[11px]">
                {alerts.map(a => (
                  <tr key={a.id} className="hover:bg-rose-950/20 font-mono">
                    <td className="px-3 py-2 text-rose-400 font-bold">#{a.sequence_number}</td>
                    <td className="px-3 py-2 text-slate-400">{new Date(a.timestamp).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 text-sky-400">@{a.username}</td>
                    <td className="px-3 py-2 text-rose-300 font-semibold">{a.action}</td>
                    <td className="px-3 py-2 text-slate-300">{a.document_title || (a.document_id ? `ID #${a.document_id}` : '-')}</td>
                    <td className="px-3 py-2 text-slate-400 truncate max-w-xs">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Accounts Management Modal (Admin Only) */}
      {isAdmin && showUserModal && (
        <div className="p-5 rounded-2xl bg-vault-900 border border-vault-border space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Users className="w-4 h-4 text-sky-400" />
              <span>User Directory & Account Status Management</span>
            </h3>
            <button
              onClick={() => setShowUserModal(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>

          {/* Provision User Form */}
          <form onSubmit={handleCreateUser} className="p-4 rounded-xl bg-vault-850/60 border border-vault-border grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Username *</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="e.g. dev_sarah"
                className="w-full px-2.5 py-1.5 bg-vault-950 border border-vault-border rounded-lg text-xs text-slate-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Email *</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="sarah@corp.internal"
                className="w-full px-2.5 py-1.5 bg-vault-950 border border-vault-border rounded-lg text-xs text-slate-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={e => setNewFullName(e.target.value)}
                placeholder="Sarah Connor"
                className="w-full px-2.5 py-1.5 bg-vault-950 border border-vault-border rounded-lg text-xs text-slate-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Role *</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-vault-950 border border-vault-border rounded-lg text-xs text-slate-200 focus:outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="owner">Document Owner</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Initial Password *</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 8 chars"
                className="w-full px-2.5 py-1.5 bg-vault-950 border border-vault-border rounded-lg text-xs text-slate-200 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-5 flex justify-end">
              <button
                type="submit"
                disabled={creatingUser}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-sm"
              >
                {creatingUser ? 'Provisioning...' : 'Provision User Account'}
              </button>
            </div>
          </form>

          {/* Users Table */}
          <div className="border border-vault-border rounded-xl overflow-hidden bg-vault-950 max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-vault-850/80 text-slate-400 border-b border-vault-border font-medium">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vault-border/50 text-[11px]">
                {usersList.map(u => (
                  <tr key={u.id} className="hover:bg-vault-850/40">
                    <td className="px-3 py-2 text-slate-500 font-mono">#{u.id}</td>
                    <td className="px-3 py-2 font-medium text-slate-200">
                      {u.full_name} <span className="text-slate-400 font-mono">(@{u.username})</span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{u.email}</td>
                    <td className="px-3 py-2 uppercase font-mono font-semibold text-slate-300">{u.role}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        u.is_active ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                      }`}>
                        {u.is_active ? 'ACTIVE' : 'DEACTIVATED'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleToggleUserStatus(u.id, u.is_active)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          u.is_active
                            ? 'text-rose-400 hover:bg-rose-950/60'
                            : 'text-emerald-400 hover:bg-emerald-950/60'
                        }`}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comprehensive Audit Trail Table */}
      <div className="p-5 rounded-2xl bg-vault-900 border border-vault-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Database className="w-4 h-4 text-sky-400" />
              <span>Cryptographic Audit Log Records ({filteredLogs.length})</span>
            </h3>
            <p className="text-xs text-slate-400">Append-only sequence &bull; Every security decision recorded synchronously</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search actions, users, details..."
              className="w-full pl-9 pr-3 py-1.5 bg-vault-950 border border-vault-border rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="border border-vault-border rounded-xl overflow-hidden bg-vault-950 overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[750px]">
            <thead className="bg-vault-850/80 text-slate-400 border-b border-vault-border font-medium">
              <tr>
                <th className="px-3.5 py-2.5">Seq</th>
                <th className="px-3.5 py-2.5">Timestamp</th>
                <th className="px-3.5 py-2.5">Actor</th>
                <th className="px-3.5 py-2.5">Action</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Document Target</th>
                <th className="px-3.5 py-2.5">Security Event Details</th>
                <th className="px-3.5 py-2.5">Block Hash (HMAC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vault-border/50 text-[11px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-vault-850/40 transition-colors font-mono">
                    <td className="px-3.5 py-2.5 text-sky-400 font-bold">#{log.sequence_number}</td>
                    <td className="px-3.5 py-2.5 text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-200 font-semibold">@{log.username}</td>
                    <td className="px-3.5 py-2.5 text-slate-300">{log.action}</td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-300 truncate max-w-[140px]">
                      {log.document_title || (log.document_id ? `#${log.document_id}` : '-')}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-400 truncate max-w-[220px]" title={log.details || ''}>
                      {log.details || '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 truncate max-w-[90px]" title={log.entry_hash}>
                      {log.entry_hash.slice(0, 10)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
