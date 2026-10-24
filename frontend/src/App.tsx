import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Document, DocumentSensitivity } from './types';
import { api, ApiError } from './services/api';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { UploadModal } from './components/UploadModal';
import { DocumentDetailModal } from './components/DocumentDetailModal';
import { SharingModal } from './components/SharingModal';
import { AuditDashboard } from './components/AuditDashboard';
import { ThreatModelView } from './components/ThreatModelView';
import {
  FileText,
  Search,
  Filter,
  Plus,
  Lock,
  Download,
  Share2,
  Eye,
  ShieldAlert,
  ShieldCheck,
  HardDrive,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react';

export const AppContent: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'vault' | 'audit' | 'threats'>('vault');

  // Vault State
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modals State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedDocForDetail, setSelectedDocForDetail] = useState<Document | null>(null);
  const [selectedDocForSharing, setSelectedDocForSharing] = useState<Document | null>(null);

  // IDOR Probe test state
  const [probeResult, setProbeResult] = useState<{ id: number; status: number; message: string } | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, selectedCategory]);

  const loadDocuments = async () => {
    setLoadingDocs(true);
    setErrorMsg(null);
    try {
      const docs = await api.listDocuments({
        search: searchQuery || undefined,
        category: selectedCategory || undefined,
      });
      setDocuments(docs);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.detail);
      } else {
        setErrorMsg('Failed to load confidential vault documents.');
      }
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadDocuments();
  };

  // Live IDOR Probe Tester: Attempts to directly query a document that might not be granted
  const handleSimulateProbe = async (targetDocId: number) => {
    setProbing(true);
    setProbeResult(null);
    try {
      await api.getDocument(targetDocId);
      setProbeResult({
        id: targetDocId,
        status: 200,
        message: `Direct access permitted (user has authorized grant or ownership on doc #${targetDocId}).`,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setProbeResult({
          id: targetDocId,
          status: err.status,
          message: `Access denied by server: ${err.detail} (HTTP ${err.status} logged in audit trail).`,
        });
      } else {
        setProbeResult({
          id: targetDocId,
          status: 500,
          message: 'Probe request failed.',
        });
      }
    } finally {
      setProbing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-vault-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
          <span className="text-sm font-medium">Initializing Secure Session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';

  return (
    <div className="min-h-screen bg-vault-950 flex flex-col text-slate-200">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grow w-full">
        {/* Vault Tab */}
        {activeTab === 'vault' && (
          <div className="space-y-6">
            {/* Notifications */}
            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center justify-between animate-fade-in">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
                <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white text-xs">
                  Dismiss
                </button>
              </div>
            )}
            {successBanner && (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between animate-fade-in">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{successBanner}</span>
                </div>
                <button onClick={() => setSuccessBanner(null)} className="text-slate-400 hover:text-white text-xs">
                  Dismiss
                </button>
              </div>
            )}

            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2.5">
                  <Lock className="w-6 h-6 text-sky-400" />
                  <span>Confidential Document Vault</span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Server-enforced access isolation &bull; Only authorized documents are visible or discoverable
                </p>
              </div>

              <div className="flex items-center space-x-3">
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-sky-500/20 flex items-center space-x-2 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Upload Document</span>
                  </button>
                )}

                <button
                  onClick={loadDocuments}
                  disabled={loadingDocs}
                  className="p-2 rounded-xl bg-vault-850 hover:bg-vault-800 border border-vault-border text-slate-300 hover:text-white transition-colors"
                  title="Refresh Vault Documents"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingDocs ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Search & Category Filter Bar */}
            <div className="p-4 rounded-2xl bg-vault-900 border border-vault-border flex flex-col sm:flex-row items-center justify-between gap-3">
              <form onSubmit={handleSearch} className="relative w-full sm:w-96">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search authorized titles or filenames..."
                  className="w-full pl-10 pr-3.5 py-2 bg-vault-950 border border-vault-border rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
              </form>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 bg-vault-950 border border-vault-border rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 w-full sm:w-auto"
                >
                  <option value="">All Categories</option>
                  <option value="Contracts">Contracts</option>
                  <option value="Finance">Finance</option>
                  <option value="Salaries">Salaries</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Audits">Audits</option>
                  <option value="Legal">Legal</option>
                  <option value="Strategy">Strategy</option>
                  <option value="General">General</option>
                </select>
              </div>
            </div>

            {/* Document Cards Grid */}
            {loadingDocs ? (
              <div className="py-16 text-center text-slate-500">
                <div className="w-6 h-6 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mx-auto mb-2" />
                Authorizing and retrieving vault documents...
              </div>
            ) : documents.length === 0 ? (
              <div className="py-16 text-center rounded-2xl bg-vault-900/40 border border-vault-border space-y-3">
                <ShieldAlert className="w-10 h-10 mx-auto text-slate-500" />
                <h3 className="text-base font-semibold text-slate-300">No Documents Accessible</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {user.role === 'viewer'
                    ? "You currently have no active read or edit grants on confidential documents. To test access, switch to an Owner persona and grant access to @" + user.username + "."
                    : "No matching documents found in your authorized vault repository."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map(doc => {
                  const isOwner = doc.owner_id === user.id || doc.my_permission === 'owner';
                  return (
                    <div
                      key={doc.id}
                      className="glass-card rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-sky-500/40 transition-all group"
                    >
                      <div className="space-y-3">
                        {/* Header Badges */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-vault-800 text-slate-300 border border-vault-border">
                            {doc.category}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              doc.sensitivity === 'Restricted'
                                ? 'bg-rose-950/70 text-rose-300 border-rose-800'
                                : doc.sensitivity === 'Confidential'
                                ? 'bg-amber-950/70 text-amber-300 border-amber-800'
                                : 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                            }`}
                          >
                            {doc.sensitivity}
                          </span>
                        </div>

                        {/* Title & Filename */}
                        <div>
                          <h3
                            onClick={() => setSelectedDocForDetail(doc)}
                            className="text-sm font-semibold text-white group-hover:text-sky-300 transition-colors cursor-pointer line-clamp-2"
                          >
                            {doc.title}
                          </h3>
                          <p className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                            {doc.filename}
                          </p>
                        </div>

                        {/* Fingerprint preview */}
                        <div className="p-2 rounded-lg bg-vault-950/80 border border-vault-border/60 text-[10px] font-mono text-slate-400 truncate">
                          <span className="text-slate-500">SHA256: </span>
                          <span className="text-sky-400">{doc.sha256_hash.slice(0, 16)}...</span>
                        </div>
                      </div>

                      {/* Footer Details & Buttons */}
                      <div className="pt-3 border-t border-vault-border/60 space-y-3">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Owner: <strong className="text-slate-300">@{doc.owner_username || doc.owner_id}</strong></span>
                          <span className="font-mono">{(doc.file_size / 1024).toFixed(1)} KB</span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            onClick={() => setSelectedDocForDetail(doc)}
                            className="px-3 py-1.5 rounded-lg bg-vault-800 hover:bg-vault-700 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 text-sky-400" />
                            <span>Details</span>
                          </button>

                          <div className="flex items-center space-x-1.5">
                            {isOwner && (
                              <button
                                onClick={() => setSelectedDocForSharing(doc)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-vault-800 transition-colors"
                                title="Manage Sharing & AI Assistant"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={() => api.downloadDocument(doc.id, doc.filename)}
                              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-sm transition-colors"
                              title="Secure Zero-Cache Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Interactive IDOR / Isolation Security Probe Test Panel */}
            <div className="mt-8 p-5 rounded-2xl bg-gradient-to-br from-vault-900 to-vault-850 border border-vault-border space-y-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Interactive Security Evaluator: Cross-User Probe Simulator
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Test the server's real-time access boundary: Probe document ID #1, #2, #3, or non-existent #999 directly as current user @{user.username}.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                {[1, 2, 3, 4, 999].map(targetId => (
                  <button
                    key={targetId}
                    disabled={probing}
                    onClick={() => handleSimulateProbe(targetId)}
                    className="px-3 py-1.5 rounded-lg bg-vault-950 hover:bg-vault-800 border border-vault-border text-xs font-mono text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Probe Doc #{targetId}
                  </button>
                ))}
              </div>

              {probeResult && (
                <div
                  className={`p-3 rounded-xl border text-xs font-mono animate-fade-in ${
                    probeResult.status === 200
                      ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-800 text-rose-300'
                  }`}
                >
                  <div className="font-semibold mb-0.5">
                    Response: HTTP {probeResult.status} {probeResult.status === 403 ? 'FORBIDDEN (Denied & Logged)' : probeResult.status === 404 ? 'NOT FOUND' : 'OK'}
                  </div>
                  <div>{probeResult.message}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit & Security Tab */}
        {activeTab === 'audit' && (
          <AuditDashboard currentUserRole={user.role} />
        )}

        {/* Threat Model Tab */}
        {activeTab === 'threats' && (
          <ThreatModelView />
        )}
      </main>

      {/* Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={newDoc => {
          setSuccessBanner(`Document "${newDoc.title}" successfully encrypted and stored in vault.`);
          loadDocuments();
        }}
      />

      {selectedDocForDetail && (
        <DocumentDetailModal
          isOpen={true}
          onClose={() => setSelectedDocForDetail(null)}
          document={selectedDocForDetail}
          currentUserId={user.id}
          currentUserRole={user.role}
          onOpenSharing={() => {
            const doc = selectedDocForDetail;
            setSelectedDocForDetail(null);
            setSelectedDocForSharing(doc);
          }}
          onDocumentUpdated={() => {
            setSuccessBanner('Document updated successfully.');
            loadDocuments();
            setSelectedDocForDetail(null);
          }}
          onDocumentDeleted={() => {
            setSuccessBanner('Document permanently deleted from vault.');
            loadDocuments();
            setSelectedDocForDetail(null);
          }}
        />
      )}

      {selectedDocForSharing && (
        <SharingModal
          isOpen={true}
          onClose={() => setSelectedDocForSharing(null)}
          document={selectedDocForSharing}
          isOwner={selectedDocForSharing.owner_id === user.id || selectedDocForSharing.my_permission === 'owner'}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

export default App;
