import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../services/api';
import { Document, PermissionEntry, User, AISuggestionResponse, PermissionLevel } from '../types';
import {
  X,
  Users,
  UserPlus,
  Trash2,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Clock,
  KeyRound,
  FileCheck,
} from 'lucide-react';

interface SharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
  isOwner: boolean;
}

export const SharingModal: React.FC<SharingModalProps> = ({
  isOpen,
  onClose,
  document,
  isOwner,
}) => {
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Grant Form State
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<PermissionLevel>('read');
  const [granting, setGranting] = useState(false);

  // AI Assistant State
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestionResponse | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [confirmingUserId, setConfirmingUserId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, document.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [perms, users] = await Promise.all([
        api.listPermissions(document.id),
        api.listUsers(),
      ]);
      setPermissions(perms);
      setAllUsers(users);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to load document access list.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setGranting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await api.grantPermission(document.id, selectedUser, selectedLevel);
      setSuccessMsg(res.message);
      setSelectedUser('');
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to grant permission.');
      }
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (userId: number, username: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await api.revokePermission(document.id, userId);
      setSuccessMsg(`Access for @${username} was immediately revoked.`);
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to revoke permission.');
      }
    }
  };

  const handleQueryAI = async () => {
    setLoadingAI(true);
    setError(null);
    try {
      const res = await api.getAISuggestions(document.id);
      setAiSuggestions(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to query AI access recommendations.');
      }
    } finally {
      setLoadingAI(false);
    }
  };

  const handleConfirmAISuggestion = async (userId: number, username: string, level: PermissionLevel) => {
    setConfirmingUserId(userId);
    setError(null);
    try {
      const res = await api.confirmAISuggestion(document.id, username, level);
      setSuccessMsg(res.message);
      // Remove from suggestions
      if (aiSuggestions) {
        setAiSuggestions({
          ...aiSuggestions,
          suggested_grants: aiSuggestions.suggested_grants.filter(g => g.user_id !== userId),
        });
      }
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to confirm AI recommendation.');
      }
    } finally {
      setConfirmingUserId(null);
    }
  };

  if (!isOpen) return null;

  // Filter users eligible for new grant: active, not owner, not already granted
  const grantedUserIds = new Set(permissions.map(p => p.user_id));
  const candidateUsers = allUsers.filter(
    u => u.is_active && u.id !== document.owner_id && !grantedUserIds.has(u.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-vault-900 border border-vault-border rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-slide-up my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-vault-border flex items-center justify-between bg-vault-850/70 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/40">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Access & Sharing Permissions</h3>
              <p className="text-xs text-slate-400 truncate max-w-md">
                Document: <span className="text-slate-200 font-medium">{document.title}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-vault-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto grow">
          {/* Status Messages */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-start space-x-2.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1: Active Access Grants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                <span>Active Document Grants ({permissions.length})</span>
              </h4>
              <span className="text-[11px] text-slate-500">Revocation is enforced on the immediate next request</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                <div className="w-5 h-5 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mx-auto mb-2" />
                Verifying active access grants...
              </div>
            ) : permissions.length === 0 ? (
              <div className="p-6 rounded-xl bg-vault-950 border border-vault-border/80 text-center text-slate-400 text-xs">
                <ShieldAlert className="w-6 h-6 mx-auto mb-1.5 text-slate-500" />
                <p className="font-medium text-slate-300">Strictly Isolated Document</p>
                <p className="text-slate-500 mt-0.5">Only the document owner has access. No third-party grants exist.</p>
              </div>
            ) : (
              <div className="border border-vault-border rounded-xl overflow-hidden bg-vault-950">
                <table className="w-full text-left text-xs">
                  <thead className="bg-vault-850/80 text-slate-400 border-b border-vault-border">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Grantee</th>
                      <th className="px-3 py-2.5 font-medium">Permission</th>
                      <th className="px-3 py-2.5 font-medium">Granted By</th>
                      <th className="px-3 py-2.5 font-medium">Granted At</th>
                      {isOwner && <th className="px-4 py-2.5 font-medium text-right">Revoke</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-vault-border/60">
                    {permissions.map(perm => (
                      <tr key={perm.user_id} className="hover:bg-vault-850/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-200">{perm.full_name}</div>
                          <div className="text-[11px] font-mono text-slate-400">@{perm.username}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              perm.permission_level === 'edit'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                                : 'bg-sky-950/60 text-sky-300 border-sky-800/60'
                            }`}
                          >
                            {perm.permission_level.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-300 font-mono text-[11px]">
                          @{perm.granted_by_username || perm.granted_by}
                        </td>
                        <td className="px-3 py-3 text-slate-400 text-[11px]">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{new Date(perm.granted_at).toLocaleDateString()}</span>
                          </div>
                        </td>
                        {isOwner && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRevoke(perm.user_id, perm.username)}
                              className="px-2.5 py-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-950/80 border border-rose-900/40 hover:border-rose-700 text-xs transition-all flex items-center space-x-1 ml-auto"
                              title="Immediate Revocation (Takes effect immediately)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Revoke</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Grant New Permission (Strictly Owner) */}
          {isOwner ? (
            <div className="p-4 rounded-xl bg-vault-850/60 border border-vault-border">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center space-x-2">
                <UserPlus className="w-3.5 h-3.5 text-sky-400" />
                <span>Grant Access to Named User</span>
              </h4>

              <form onSubmit={handleGrant} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Select Active User</label>
                  <select
                    value={selectedUser}
                    onChange={e => setSelectedUser(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-vault-950 border border-vault-border rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  >
                    <option value="">-- Choose verified user --</option>
                    {candidateUsers.map(u => (
                      <option key={u.id} value={u.username}>
                        {u.full_name} (@{u.username}) - {u.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Permission Level</label>
                  <select
                    value={selectedLevel}
                    onChange={e => setSelectedLevel(e.target.value as PermissionLevel)}
                    className="w-full px-3 py-2 bg-vault-950 border border-vault-border rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  >
                    <option value="read">Read (Download)</option>
                    <option value="edit">Edit (Revise)</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={granting || !selectedUser}
                    className="w-full py-2 px-3 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-sky-600/20 flex items-center justify-center space-x-1.5"
                  >
                    {granting ? (
                      <span>Granting...</span>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Authorize Grant</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-vault-950/80 border border-vault-border text-xs text-slate-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Permission granting and revocation are strictly reserved for the document owner.</span>
            </div>
          )}

          {/* Section 3: AI Access Assistant */}
          {isOwner && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-vault-850 to-vault-900 border border-sky-500/30">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">AI Access Assistant</h4>
                    <p className="text-[11px] text-slate-400">Least-privilege recommendation engine</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleQueryAI}
                  disabled={loadingAI}
                  className="px-3 py-1.5 text-xs font-medium bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 border border-sky-500/40 rounded-lg transition-colors flex items-center space-x-1.5"
                >
                  {loadingAI ? (
                    <>
                      <div className="w-3 h-3 border-2 border-sky-400/20 border-t-sky-400 rounded-full animate-spin" />
                      <span>Analyzing Metadata...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" />
                      <span>Generate Recommendations</span>
                    </>
                  )}
                </button>
              </div>

              {/* Safety Invariant Notice */}
              <div className="p-2.5 rounded-lg bg-vault-950/80 border border-vault-border/80 text-[11px] text-slate-400 mb-3 flex items-start space-x-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Safety Invariant:</strong> Machine recommendations are advisory only.
                  Access is NEVER granted automatically without explicit human owner approval.
                </span>
              </div>

              {/* AI Suggestions Display */}
              {aiSuggestions && (
                <div className="space-y-2 mt-3 animate-fade-in">
                  {aiSuggestions.suggested_grants.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">
                      No further candidate grants recommended for this sensitivity level.
                    </p>
                  ) : (
                    aiSuggestions.suggested_grants.map(grant => (
                      <div
                        key={grant.user_id}
                        className="p-3 rounded-xl bg-vault-950 border border-vault-border flex items-center justify-between gap-3 flex-wrap"
                      >
                        <div className="space-y-1 max-w-md">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-slate-200">{grant.full_name}</span>
                            <span className="text-[10px] font-mono text-slate-400">@{grant.username}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                              Confidence: {(grant.confidence_score * 100).toFixed(0)}%
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-950 text-sky-400 border border-sky-800 uppercase font-mono">
                              {grant.recommended_level}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">{grant.justification}</p>
                        </div>

                        <button
                          type="button"
                          disabled={confirmingUserId === grant.user_id}
                          onClick={() => handleConfirmAISuggestion(grant.user_id, grant.username, grant.recommended_level)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center space-x-1 shrink-0 shadow-md shadow-emerald-600/20"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          <span>Approve & Grant</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-vault-border bg-vault-850/60 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">Document ID #{document.id} &bull; SHA-256 Verified</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-300 hover:text-white bg-vault-800 hover:bg-vault-700 rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
