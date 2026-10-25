import React, { useState, useRef } from 'react';
import { api, ApiError } from '../services/api';
import { Document, DocumentSensitivity } from '../types';
import { X, Upload, FileText, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newDoc: Document) => void;
}

const FORBIDDEN_EXTS = ['.exe', '.bat', '.cmd', '.sh', '.py', '.js', '.vbs', '.ps1', '.msi', '.dll', '.scr', '.pif'];
const ALLOWED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.csv', '.docx', '.xlsx'];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Contracts');
  const [sensitivity, setSensitivity] = useState<DocumentSensitivity>('Confidential');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelection = (file: File) => {
    setValidationError(null);
    const nameLower = file.name.toLowerCase();

    // Check dangerous extension
    const isDangerous = FORBIDDEN_EXTS.some(ext => nameLower.endsWith(ext));
    if (isDangerous) {
      setValidationError(`Rejected: Executable file types (${FORBIDDEN_EXTS.slice(0, 5).join(', ')}...) are strictly prohibited.`);
      setSelectedFile(null);
      return;
    }

    // Check allowed extension
    const isAllowed = ALLOWED_EXTS.some(ext => nameLower.endsWith(ext));
    if (!isAllowed) {
      setValidationError(`Unsupported file extension. Allowed extensions: ${ALLOWED_EXTS.join(', ')}`);
      setSelectedFile(null);
      return;
    }

    // Check file size limit
    if (file.size > MAX_SIZE_BYTES) {
      setValidationError(`File exceeds maximum permitted size of 15 MB (${(file.size / (1024 * 1024)).toFixed(2)} MB uploaded).`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!title) {
      // Auto-populate title from clean filename
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setTitle(cleanTitle);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setValidationError('Please select a valid document to upload.');
      return;
    }
    if (!title.trim()) {
      setValidationError('Document title is required.');
      return;
    }

    setLoading(true);
    setValidationError(null);

    try {
      const doc = await api.uploadDocument({
        title: title.trim(),
        category,
        sensitivity,
        file: selectedFile,
      });
      onSuccess(doc);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setValidationError(err.detail);
      } else {
        setValidationError('Failed to encrypt and store document.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#14243A]/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-xl overflow-hidden shadow-xl animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center border border-[#93C5FD]">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#172033]">Deposit Confidential Document</h3>
              <p className="text-xs text-[#64748B]">Validated signature, randomized key, AES-256-GCM encryption at rest</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#172033] p-1 rounded-lg hover:bg-[#F1F5F9] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {validationError && (
            <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#B91C1C]" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Title Input */}
          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1.5">Document Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q3 Master Enterprise Services Agreement.pdf"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
            />
          </div>

          {/* Category & Sensitivity Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">Category *</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
              >
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

            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1.5">Sensitivity Level *</label>
              <select
                value={sensitivity}
                onChange={e => setSensitivity(e.target.value as DocumentSensitivity)}
                className="w-full px-3.5 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
              >
                <option value="Restricted">Restricted (Highest Isolation)</option>
                <option value="Confidential">Confidential (Default Vault)</option>
                <option value="Internal">Internal (Org Read Grant)</option>
                <option value="Public">Public (Public Domain)</option>
              </select>
            </div>
          </div>

          {/* Drag & Drop File Zone */}
          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1.5">Document File *</label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-[#2563EB] bg-[#EFF6FF]'
                  : selectedFile
                  ? 'border-[#15803D] bg-[#F0FDF4]'
                  : 'border-[#CBD5E1] hover:border-[#2563EB] bg-[#F8FAFC]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx"
                onChange={e => e.target.files && e.target.files[0] && handleFileSelection(e.target.files[0])}
              />

              {selectedFile ? (
                <div className="flex items-center justify-center space-x-3 text-[#15803D]">
                  <CheckCircle2 className="w-6 h-6 text-[#15803D]" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[#172033]">{selectedFile.name}</p>
                    <p className="text-xs text-[#64748B] font-mono">
                      {(selectedFile.size / 1024).toFixed(1)} KB &bull; Verified format
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-[#64748B]" />
                  <p className="text-sm text-[#172033]">
                    <span className="text-[#2563EB] font-medium">Click to browse</span> or drag and drop file here
                  </p>
                  <p className="text-xs text-[#64748B]">
                    PDF, DOCX, TXT, CSV, PNG, JPG, XLSX (Max 15 MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#64748B] flex items-center space-x-2">
            <Lock className="w-4 h-4 text-[#0F766E] shrink-0" />
            <span>Files are encrypted on arrival via AES-256-GCM. Unpredictable UUID keys prevent directory indexing.</span>
          </div>

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-[#64748B] hover:text-[#172033] rounded-lg hover:bg-[#F1F5F9] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedFile}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center space-x-2 transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Encrypting & Storing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Store in Vault</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
