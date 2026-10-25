import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  FileText,
  AlertTriangle,
  History,
  Lock,
  Eye,
  ExternalLink,
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
  currentUserRole,
  currentUserId,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In-Browser Preview State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);

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

  // Strict Viewer check: Viewers can NEVER edit, delete, or share
  const isViewer = currentUserRole === 'viewer';
  const isAdmin = currentUserRole === 'admin';
  const isOwner = !isViewer && (document.owner_id === currentUserId || document.my_permission === 'owner');
  const canManage = isOwner || isAdmin;
  const canEdit = !isViewer && (canManage || document.my_permission === 'edit');

  // Download permission:
  // For non-viewers: permitted
  // For viewers: only if can_download is explicitly true or allow_viewer_download is true
  const canDownload = !isViewer || Boolean(document.can_download || document.allow_viewer_download);

  const loadDocumentAudit = useCallback(async () => {
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
  }, [document.id]);

  const handleLoadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const { blob, url, mimeType } = await api.previewDocument(document.id);
      setPreviewUrl(url);
      setPreviewMime(mimeType);

      if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) {
        const text = await blob.text();
        setPreviewTextContent(text.slice(0, 5000));
      } else {
        setPreviewTextContent(null);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Preview unavailable: ${err.detail}`);
      } else {
        setError('Failed to load document preview.');
      }
    } finally {
      setLoadingPreview(false);
    }
  }, [document.id]);

  useEffect(() => {
    if (isOpen) {
      setEditTitle(document.title);
      setEditCategory(document.category);
      setEditSensitivity(document.sensitivity);
      setConfirmDelete(false);
      setIsEditingMeta(false);
      setIsRevisingContent(false);
      setError(null);
      setPreviewUrl(null);
      setPreviewTextContent(null);
      loadDocumentAudit();
      handleLoadPreview();
    }

    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, document.id, document.title, document.category, document.sensitivity, loadDocumentAudit, handleLoadPreview]);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(document.sha256_hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleDownload = async () => {
    if (!canDownload) {
      setError('Document access policy restricts viewer access to in-browser preview. Downloading is not permitted.');
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      await api.downloadDocument(document.id, document.filename);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14243A]/50 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl animate-slide-up my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center border border-[#93C5FD]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-semibold text-[#172033]">{document.title}</h3>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                    document.sensitivity === 'Restricted'
                      ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'
                      : document.sensitivity === 'Confidential'
                      ? 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]'
                      : 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]'
                  }`}
                >
                  {document.sensitivity}
                </span>
                {isViewer && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#E2E8F0] text-[#172033]">
                    VIEWER READ-ONLY
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B] font-mono">
                Filename: {document.filename} &bull; Category: {document.category}
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
          {error && (
            <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-xs flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#B91C1C]" />
              <span>{error}</span>
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {canDownload ? (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{downloading ? 'Decrypting...' : 'Download Payload'}</span>
              </button>
            ) : (
              <div className="px-3.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] text-xs font-medium flex items-center space-x-2">
                <Lock className="w-3.5 h-3.5 text-[#B45309]" />
                <span>Preview Only (Download Restricted by Policy)</span>
              </div>
            )}

            {canManage && (
              <button
                onClick={onOpenSharing}
                className="px-3.5 py-2 rounded-lg bg-[#F0FDFA] hover:bg-[#CCFBF1] text-[#0F766E] border border-[#0F766E]/30 text-xs font-semibold flex items-center justify-center space-x-2 transition-colors cursor-pointer"
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
                className="px-3.5 py-2 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E2E8F0] text-xs font-semibold flex items-center justify-center space-x-2 transition-colors cursor-pointer"
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
                className="px-3.5 py-2 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E2E8F0] text-xs font-semibold flex items-center justify-center space-x-2 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Revise Version</span>
              </button>
            )}
          </div>

          {/* In-Browser Document Preview Section */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center space-x-2">
                <Eye className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>In-Browser Document Preview</span>
              </h4>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[#2563EB] hover:text-[#1D4ED8] flex items-center space-x-1 font-medium"
                >
                  <span>Open Stream</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {loadingPreview ? (
              <div className="py-8 text-center text-xs text-[#64748B] flex flex-col items-center space-y-2">
                <div className="w-5 h-5 border-2 border-[#2563EB]/20 border-t-[#2563EB] rounded-full animate-spin" />
                <span>Authorizing and streaming decrypted preview...</span>
              </div>
            ) : previewUrl ? (
              <div className="rounded-lg border border-[#E2E8F0] overflow-hidden bg-white">
                {previewMime.startsWith('image/') ? (
                  <div className="p-4 flex justify-center bg-[#F1F5F9]">
                    <img src={previewUrl} alt={document.title} className="max-h-80 rounded shadow-xs" />
                  </div>
                ) : previewMime.includes('pdf') ? (
                  <iframe
                    src={previewUrl}
                    title={document.title}
                    className="w-full h-80 border-0"
                  />
                ) : previewTextContent ? (
                  <pre className="p-4 text-xs font-mono text-[#172033] bg-white overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap">
                    {previewTextContent}
                  </pre>
                ) : (
                  <div className="p-6 text-center text-xs text-[#64748B] space-y-2">
                    <FileText className="w-8 h-8 text-[#94A3B8] mx-auto" />
                    <p className="font-semibold text-[#172033]">{document.filename}</p>
                    <p className="text-[11px]">Inline stream verified ({document.mime_type}). Preview rendered via zero-cache stream.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#64748B]">
                Click to load in-browser preview stream.
              </div>
            )}
          </div>

          {/* Edit Metadata Form (Collapsible) */}
          {isEditingMeta && canEdit && (
            <form onSubmit={handleSaveMetadata} className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3 animate-fade-in">
              <h4 className="text-xs font-semibold text-[#172033] flex items-center space-x-1.5">
                <Edit3 className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Update Document Information</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-xs text-[#172033] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-1">Sensitivity</label>
                  <select
                    value={editSensitivity}
                    onChange={e => setEditSensitivity(e.target.value as DocumentSensitivity)}
                    className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-xs text-[#172033] focus:outline-none"
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
                  className="px-3 py-1.5 text-xs text-[#64748B] hover:text-[#172033]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingMeta}
                  className="px-4 py-1.5 text-xs bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg"
                >
                  {updatingMeta ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Revise Content Form (Collapsible) */}
          {isRevisingContent && canEdit && (
            <form onSubmit={handleReviseContent} className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3 animate-fade-in">
              <h4 className="text-xs font-semibold text-[#172033] flex items-center space-x-1.5">
                <Upload className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Upload New Payload Version</span>
              </h4>
              <p className="text-[11px] text-[#64748B]">
                Replaces existing ciphertext on disk with newly validated, AES-256-GCM encrypted payload while retaining audit history.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                required
                className="block w-full text-xs text-[#172033] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#EFF6FF] file:text-[#2563EB] hover:file:bg-[#DBEAFE] cursor-pointer"
                onChange={e => e.target.files && setRevisingFile(e.target.files[0])}
              />
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRevisingContent(false)}
                  className="px-3 py-1.5 text-xs text-[#64748B] hover:text-[#172033]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingContent || !revisingFile}
                  className="px-4 py-1.5 text-xs bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg disabled:opacity-50"
                >
                  {updatingContent ? 'Encrypting & Storing...' : 'Commit New Version'}
                </button>
              </div>
            </form>
          )}

          {/* Security & Cryptographic Details */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center space-x-2">
              <Lock className="w-3.5 h-3.5 text-[#0F766E]" />
              <span>Cryptographic Fingerprint & Security Profile</span>
            </h4>

            {/* SHA-256 Hash Display */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-[#64748B] mb-1">
                <span>Payload SHA-256 Hash (Integrity Checksum)</span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="text-[#2563EB] hover:text-[#1D4ED8] flex items-center space-x-1 font-medium"
                >
                  {copiedHash ? (
                    <>
                      <Check className="w-3 h-3 text-[#15803D]" />
                      <span className="text-[#15803D]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Digest</span>
                    </>
                  )}
                </button>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] font-mono text-xs text-[#0F766E] break-all select-all font-medium">
                {document.sha256_hash}
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div>
                <span className="text-[#64748B] block text-[10px]">Owner</span>
                <span className="font-semibold text-[#172033]">@{document.owner_username || document.owner_id}</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[10px]">Size</span>
                <span className="font-mono text-[#172033]">{(document.file_size / 1024).toFixed(1)} KB</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[10px]">Uploaded</span>
                <span className="text-[#172033]">{new Date(document.created_at).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-[#64748B] block text-[10px]">Your Access</span>
                <span className="font-semibold text-[#15803D] uppercase font-mono">{document.my_permission || 'Granted'}</span>
              </div>
            </div>
          </div>

          {/* Document Audit History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center space-x-2">
                <History className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Document Lifecycle Audit Trail</span>
              </h4>
              <span className="text-[11px] text-[#64748B] font-medium">Cryptographically Chained</span>
            </div>

            {loadingAudit ? (
              <div className="p-4 text-center text-xs text-[#64748B]">Loading audit trail...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-3 rounded-lg bg-white border border-[#E2E8F0] text-xs text-[#64748B] text-center">
                Audit history accessible by document owner or administrator.
              </div>
            ) : (
              <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[#64748B] border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Seq</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[11px]">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-[#F8FAFC] font-mono">
                        <td className="px-3 py-2 text-[#64748B]">#{log.sequence_number}</td>
                        <td className="px-3 py-2 text-[#172033] font-semibold">{log.action}</td>
                        <td className="px-3 py-2 text-[#2563EB]">@{log.username}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.status === 'SUCCESS'
                                ? 'bg-[#F0FDF4] text-[#15803D]'
                                : 'bg-[#FEF2F2] text-[#B91C1C]'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#64748B]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Strict Owner or Admin Deletion Zone */}
          {canManage && (
            <div className="p-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] flex items-center justify-between">
              <div>
                <h5 className="text-xs font-semibold text-[#B91C1C]">Permanent Vault Deletion</h5>
                <p className="text-[11px] text-[#64748B]">
                  Securely wipes ciphertext from vault disk and revokes all active grants.
                </p>
              </div>

              {confirmDelete ? (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-xs text-[#64748B] hover:text-[#172033]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3.5 py-1.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold rounded-lg shadow-sm"
                  >
                    {deleting ? 'Deleting...' : 'Confirm Purge'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 rounded-lg border border-[#B91C1C] text-[#B91C1C] hover:bg-[#FEF2F2] text-xs font-medium transition-colors flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Document</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#64748B] font-mono">UUID: {document.uuid}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-[#172033] hover:bg-[#E2E8F0] bg-white border border-[#E2E8F0] rounded-lg transition-colors font-medium shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
