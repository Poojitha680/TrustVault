import React, { useState, useEffect, useCallback } from 'react';
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
  const [canDownload, setCanDownload] = useState(false);
  const [granting, setGranting] = useState(false);

  // AI Assistant State
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestionResponse | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [confirmingUserId, setConfirmingUserId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
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
  }, [document.id]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setGranting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await api.grantPermission(document.id, selectedUser, selectedLevel, canDownload);
      setSuccessMsg(res.message);
      setSelectedUser('');
      setCanDownload(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14243A]/50 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl animate-slide-up my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center border border-[#93C5FD]">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#172033]">Access & Sharing Permissions</h3>
              <p className="text-xs text-[#64748B] truncate max-w-md">
                Document: <span className="text-[#172033] font-medium">{document.title}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#172033] p-1 rounded-lg hover:bg-[#F1F5F9] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto grow">
          {/* Status Messages */}
          {error && (
            <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#B91C1C]" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] text-xs flex items-start space-x-2.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#15803D]" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1: Active Access Grants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center space-x-2">
                <Users className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Active Document Grants ({permissions.length})</span>
              </h4>
              <span className="text-[11px] text-[#64748B]">Revocation takes effect immediately</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-[#64748B] text-sm">
                <div className="w-5 h-5 border-2 border-[#2563EB]/20 border-t-[#2563EB] rounded-full animate-spin mx-auto mb-2" />
                Verifying active access grants...
              </div>
            ) : permissions.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-center text-[#64748B] text-xs">
                <ShieldAlert className="w-6 h-6 mx-auto mb-1.5 text-[#94A3B8]" />
                <p className="font-semibold text-[#172033]">Strictly Isolated Document</p>
                <p className="text-[#64748B] mt-0.5">Only the document owner has access. No third-party grants exist.</p>
              </div>
            ) : (
              <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[#64748B] border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Grantee</th>
                      <th className="px-3 py-2.5 font-medium">Permission</th>
                      <th className="px-3 py-2.5 font-medium">Download Policy</th>
                      <th className="px-3 py-2.5 font-medium">Granted By</th>
                      <th className="px-3 py-2.5 font-medium">Granted At</th>
                      {isOwner && <th className="px-4 py-2.5 font-medium text-right">Revoke</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {permissions.map(perm => (
                      <tr key={perm.user_id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#172033]">{perm.full_name}</div>
                          <div className="text-[11px] font-mono text-[#64748B]">@{perm.username}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              perm.permission_level === 'edit'
                                ? 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]'
                                : 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'
                            }`}
                          >
                            {perm.permission_level.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              perm.can_download
                                ? 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]'
                                : 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]'
                            }`}
                          >
                            {perm.can_download ? 'Download Permitted' : 'Preview Only'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[#172033] font-mono text-[11px]">
                          @{perm.granted_by_username || perm.granted_by}
                        </td>
                        <td className="px-3 py-3 text-[#64748B] text-[11px]">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-[#94A3B8]" />
                            <span>{new Date(perm.granted_at).toLocaleDateString()}</span>
                          </div>
                        </td>
                        {isOwner && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRevoke(perm.user_id, perm.username)}
                              className="px-2.5 py-1 rounded-lg text-[#B91C1C] hover:text-white hover:bg-[#B91C1C] border border-[#FECACA] hover:border-[#B91C1C] text-xs transition-colors flex items-center space-x-1 ml-auto font-medium cursor-pointer"
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
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#172033] flex items-center space-x-2">
                <UserPlus className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Grant Access to Named User</span>
              </h4>

              <form onSubmit={handleGrant} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6">
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">Select Active User</label>
                    <select
                      value={selectedUser}
                      onChange={e => {
                        const targetUsername = e.target.value;
                        setSelectedUser(targetUsername);
                        const targetUserObj = allUsers.find(u => u.username === targetUsername);
                        if (targetUserObj?.role === 'viewer') {
                          setSelectedLevel('read');
                        }
                      }}
                      required
                      className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-xs text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
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
                    <label className="block text-[11px] font-medium text-[#64748B] mb-1">Permission Level</label>
                    {allUsers.find(u => u.username === selectedUser)?.role === 'viewer' ? (
                      <div className="px-3 py-2 bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg text-xs font-medium text-[#64748B]">
                        Read (Viewer)
                      </div>
                    ) : (
                      <select
                        value={selectedLevel}
                        onChange={e => setSelectedLevel(e.target.value as PermissionLevel)}
                        className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-xs text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
                      >
                        <option value="read">Read</option>
                        <option value="edit">Edit (Revise)</option>
                      </select>
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <button
                      type="submit"
                      disabled={granting || !selectedUser}
                      className="w-full py-2 px-3 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer"
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
                </div>

                {/* Explicit Download Permission Checkbox */}
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="grant-can-download"
                    checked={canDownload}
                    onChange={e => setCanDownload(e.target.checked)}
                    className="w-4 h-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                  />
                  <label htmlFor="grant-can-download" className="text-xs text-[#172033] cursor-pointer font-medium">
                    Explicitly permit document downloading
                    <span className="text-[#64748B] font-normal ml-1">
                      (If unchecked, access is restricted to in-browser preview only)
                    </span>
                  </label>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#64748B] flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-[#94A3B8] shrink-0" />
              <span>Permission granting and revocation are strictly reserved for the document owner.</span>
            </div>
          )}

          {/* Section 3: AI Access Assistant */}
          {isOwner && (
            <div className="p-4 rounded-xl bg-[#F0FDFA] border border-[#0F766E]/30">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-lg bg-[#0F766E]/20 flex items-center justify-center text-[#0F766E]">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-[#172033]">AI Access Assistant</h4>
                    <p className="text-[11px] text-[#64748B]">Least-privilege recommendation engine</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleQueryAI}
                  disabled={loadingAI}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-[#0F766E] hover:bg-[#CCFBF1] border border-[#0F766E]/40 rounded-lg transition-colors flex items-center space-x-1.5 shadow-2xs"
                >
                  {loadingAI ? (
                    <>
                      <div className="w-3 h-3 border-2 border-[#0F766E]/20 border-t-[#0F766E] rounded-full animate-spin" />
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
              <div className="p-2.5 rounded-lg bg-white border border-[#CCFBF1] text-[11px] text-[#0F766E] mb-3 flex items-start space-x-2">
                <ShieldAlert className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" />
                <span>
                  <strong>Safety Invariant:</strong> Machine recommendations are advisory only.
                  Access is NEVER granted automatically without explicit human owner approval.
                </span>
              </div>

              {/* AI Suggestions Display */}
              {aiSuggestions && (
                <div className="space-y-2 mt-3 animate-fade-in">
                  {aiSuggestions.suggested_grants.length === 0 ? (
                    <p className="text-xs text-[#64748B] italic py-2">
                      No further candidate grants recommended for this sensitivity level.
                    </p>
                  ) : (
                    aiSuggestions.suggested_grants.map(grant => (
                      <div
                        key={grant.user_id}
                        className="p-3 rounded-lg bg-white border border-[#CCFBF1] flex items-center justify-between gap-3 flex-wrap"
                      >
                        <div className="space-y-1 max-w-md">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-[#172033]">{grant.full_name}</span>
                            <span className="text-[10px] font-mono text-[#64748B]">@{grant.username}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0] font-medium">
                              Confidence: {(grant.confidence_score * 100).toFixed(0)}%
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] uppercase font-mono font-medium">
                              {grant.recommended_level}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#64748B]">{grant.justification}</p>
                        </div>

                        <button
                          type="button"
                          disabled={confirmingUserId === grant.user_id}
                          onClick={() => handleConfirmAISuggestion(grant.user_id, grant.username, grant.recommended_level)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg transition-colors flex items-center space-x-1 shrink-0 shadow-sm"
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
        <div className="px-6 py-3.5 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#64748B] font-mono">Document ID #{document.id} &bull; SHA-256 Verified</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-[#172033] hover:bg-[#E2E8F0] bg-white border border-[#E2E8F0] rounded-lg transition-colors font-medium shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
