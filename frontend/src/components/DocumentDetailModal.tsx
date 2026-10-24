import React, { useState, useEffect, useRef } from 'react';
import { Document, AuditLogEntry, DocumentSensitivity } from '../types';
import { api, ApiError } from '../services/api';
import {
  X,
  Download,
  Copy,
  Check,
  Share2,
  Trash2,
  Edit3,
  Upload,
  Clock,
  HardDrive,
  FileText,
  AlertTriangle,
  History,
  Lock,
} from 'lucide-react';

interface DocumentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
  onOpenSharing: () => void;
  onDocumentUpdated: () => void;
  onDocumentDeleted: () => void;
  currentUserRole?: string;
  currentUserId?: number;
}

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  isOpen,
  onClose,
  document,
  onOpenSharing,
  onDocumentUpdated,
  onDocumentDeleted,
  currentUserId,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Metadata State
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editTitle, setEditTitle] = useState(document.title);
  const [editCategory, setEditCategory] = useState(document.category);
  const [editSensitivity, setEditSensitivity] = useState<DocumentSensitivity>(document.sensitivity);
  const [updatingMeta, setUpdatingMeta] = useState(false);

  // Version Content Upload State
  const [isRevisingContent, setIsRevisingContent] = useState(false);
  const [revisingFile, setRevisingFile] = useState<File | null>(null);
  const [updatingContent, setUpdatingContent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deletion State
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = document.owner_id === currentUserId || document.my_permission === 'owner';
  const canEdit = isOwner || document.my_permission === 'edit';

  useEffect(() => {
    if (isOpen) {
      setEditTitle(document.title);
      setEditCategory(document.category);
      setEditSensitivity(document.sensitivity);
      setConfirmDelete(false);
      setIsEditingMeta(false);
      setIsRevisingContent(false);
      loadDocumentAudit();
    }
  }, [isOpen, document.id]);

  const loadDocumentAudit = async () => {
    setLoadingAudit(true);
    try {
      const logs = await api.getAuditTrail(document.id);
      setAuditLogs(logs);
    } catch {
      // Viewer might not have permission to view audit logs for document
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleCopyHash = () => {
    navigator.clipboard.writeText(document.sha256_hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await api.downloadDocument(document.id, document.filename);
      // Reload audit after download event logged
      await loadDocumentAudit();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to download document payload.');
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingMeta(true);
    setError(null);
    try {
      await api.updateDocument(document.id, {
        title: editTitle.trim(),
        category: editCategory.trim(),
        sensitivity: editSensitivity,
      });
      setIsEditingMeta(false);
      onDocumentUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to update document metadata.');
      }
    } finally {
      setUpdatingMeta(false);
    }
  };

  const handleReviseContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisingFile) return;
    setUpdatingContent(true);
    setError(null);
    try {
      await api.updateDocumentContent(document.id, revisingFile);
      setIsRevisingContent(false);
      setRevisingFile(null);
      onDocumentUpdated();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to upload revision.');
      }
    } finally {
      setUpdatingContent(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteDocument(document.id);
      onClose();
      onDocumentDeleted();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Failed to delete document.');
      }
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-vault-900 border border-vault-border rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-slide-up my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-vault-border flex items-center justify-between bg-vault-850/70 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-vault-800 text-sky-400 flex items-center justify-center border border-vault-border">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-semibold text-white">{document.title}</h3>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                    document.sensitivity === 'Restricted'
                      ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                      : document.sensitivity === 'Confidential'
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                  }`}
                >
                  {document.sensitivity}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Filename: {document.filename} &bull; Category: {document.category}
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
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-3.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md shadow-sky-600/20 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'Decrypting...' : 'Download Payload'}</span>
            </button>

            {isOwner && (
              <button
                onClick={onOpenSharing}
                className="px-3.5 py-2.5 rounded-xl bg-vault-800 hover:bg-vault-700 text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center justify-center space-x-2 transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span>Manage Sharing</span>
              </button>
            )}

            {canEdit && (
              <button
                onClick={() => {
                  setIsEditingMeta(!isEditingMeta);
                  setIsRevisingContent(false);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-vault-800 hover:bg-vault-700 text-slate-200 border border-vault-border text-xs font-semibold flex items-center justify-center space-x-2 transition-all"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit Metadata</span>
              </button>
            )}

            {canEdit && (
              <button
                onClick={() => {
                  setIsRevisingContent(!isRevisingContent);
                  setIsEditingMeta(false);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-vault-800 hover:bg-vault-700 text-slate-200 border border-vault-border text-xs font-semibold flex items-center justify-center space-x-2 transition-all"
              >
                <Upload className="w-4 h-4" />
                <span>Revise Version</span>
              </button>
            )}
          </div>

          {/* Edit Metadata Form (Collapsible) */}
          {isEditingMeta && (
            <form onSubmit={handleSaveMetadata} className="p-4 rounded-xl bg-vault-850/80 border border-vault-border space-y-3 animate-fade-in">
              <h4 className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                <span>Update Document Information</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-vault-950 border border-vault-border rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Sensitivity</label>
                  <select
                    value={editSensitivity}
                    onChange={e => setEditSensitivity(e.target.value as DocumentSensitivity)}
                    className="w-full px-3 py-2 bg-vault-950 border border-vault-border rounded-lg text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="Restricted">Restricted</option>
                    <option value="Confidential">Confidential</option>
                    <option value="Internal">Internal</option>
                    <option value="Public">Public</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditingMeta(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingMeta}
                  className="px-4 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg"
                >
                  {updatingMeta ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Revise Content Form (Collapsible) */}
          {isRevisingContent && (
            <form onSubmit={handleReviseContent} className="p-4 rounded-xl bg-vault-850/80 border border-vault-border space-y-3 animate-fade-in">
              <h4 className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Upload New Payload Version</span>
              </h4>
              <p className="text-[11px] text-slate-400">
                Replaces existing ciphertext on disk with newly validated, AES-256-GCM encrypted payload while retaining audit history.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                required
                className="block w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-500/20 file:text-sky-300 hover:file:bg-sky-500/30 cursor-pointer"
                onChange={e => e.target.files && setRevisingFile(e.target.files[0])}
              />
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRevisingContent(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingContent || !revisingFile}
                  className="px-4 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {updatingContent ? 'Encrypting & Storing...' : 'Commit New Version'}
                </button>
              </div>
            </form>
          )}

          {/* Security & Cryptographic Details */}
          <div className="p-4 rounded-xl bg-vault-950 border border-vault-border space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              <span>Cryptographic Fingerprint & Security Profile</span>
            </h4>

            {/* SHA-256 Hash Display */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Payload SHA-256 Hash (Integrity Checksum)</span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="text-sky-400 hover:text-sky-300 flex items-center space-x-1"
                >
                  {copiedHash ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Digest</span>
                    </>
                  )}
                </button>
              </div>
              <div className="px-3 py-2 rounded-lg bg-vault-900 border border-vault-border/80 font-mono text-xs text-sky-300 break-all select-all">
                {document.sha256_hash}
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">Owner</span>
                <span className="font-medium text-slate-200">@{document.owner_username || document.owner_id}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Size</span>
                <span className="font-mono text-slate-200">{(document.file_size / 1024).toFixed(1)} KB</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Uploaded</span>
                <span className="text-slate-200">{new Date(document.created_at).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Your Access</span>
                <span className="font-semibold text-emerald-400 uppercase font-mono">{document.my_permission || 'Granted'}</span>
              </div>
            </div>
          </div>

          {/* Document Audit History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <History className="w-3.5 h-3.5 text-sky-400" />
                <span>Document Lifecycle Audit Trail</span>
              </h4>
              <span className="text-[11px] text-slate-500">Cryptographically Chained</span>
            </div>

            {loadingAudit ? (
              <div className="p-4 text-center text-xs text-slate-500">Loading audit trail...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-3 rounded-lg bg-vault-950 border border-vault-border text-xs text-slate-500 text-center">
                Audit history accessible by owner or administrator.
              </div>
            ) : (
              <div className="border border-vault-border rounded-xl overflow-hidden bg-vault-950 max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-vault-850/80 text-slate-400 border-b border-vault-border">
                    <tr>
                      <th className="px-3 py-2 font-medium">Seq</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-vault-border/50 text-[11px]">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-vault-850/40 font-mono">
                        <td className="px-3 py-2 text-slate-500">#{log.sequence_number}</td>
                        <td className="px-3 py-2 text-slate-200 font-semibold">{log.action}</td>
                        <td className="px-3 py-2 text-sky-400">@{log.username}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.status === 'SUCCESS'
                                ? 'bg-emerald-950 text-emerald-400'
                                : 'bg-rose-950 text-rose-400'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Strict Owner Deletion Zone */}
          {isOwner && (
            <div className="p-4 rounded-xl border border-rose-900/50 bg-rose-950/20 flex items-center justify-between">
              <div>
                <h5 className="text-xs font-semibold text-rose-300">Permanent Vault Deletion</h5>
                <p className="text-[11px] text-slate-400">
                  Securely wipes ciphertext from vault disk and revokes all active grants.
                </p>
              </div>

              {confirmDelete ? (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-rose-600/30"
                  >
                    {deleting ? 'Deleting...' : 'Confirm Purge'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 rounded-lg border border-rose-800 text-rose-400 hover:bg-rose-900/40 text-xs font-medium transition-colors flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Document</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-vault-border bg-vault-850/60 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">UUID: {document.uuid}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-300 hover:text-white bg-vault-800 hover:bg-vault-700 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
