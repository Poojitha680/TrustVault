export type UserRole = 'admin' | 'owner' | 'viewer';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type DocumentSensitivity = 'Public' | 'Internal' | 'Confidential' | 'Restricted';
export type PermissionLevel = 'read' | 'edit';

export interface Document {
  id: number;
  uuid: string;
  title: string;
  filename: string;
  file_size: number;
  mime_type: string;
  sha256_hash: string;
  category: string;
  sensitivity: DocumentSensitivity;
  owner_id: number;
  owner_username?: string;
  my_permission?: 'owner' | 'read' | 'edit';
  created_at: string;
  updated_at: string;
}

export interface PermissionEntry {
  user_id: number;
  username: string;
  full_name: string;
  email: string;
  permission_level: PermissionLevel;
  granted_by: number;
  granted_by_username?: string;
  granted_at: string;
}

export interface AuditLogEntry {
  id: number;
  sequence_number: number;
  timestamp: string;
  user_id?: number | null;
  username: string;
  action: string;
  document_id?: number | null;
  document_title?: string | null;
  status: 'SUCCESS' | 'REFUSED' | 'SECURITY_ALERT';
  ip_address?: string | null;
  details?: string | null;
  previous_hash: string;
  entry_hash: string;
}

export interface AuditVerificationResult {
  valid: boolean;
  total_records: number;
  corrupted_sequence?: number | null;
  reason?: string | null;
  message?: string | null;
  last_verified_sequence?: number | null;
  latest_chain_hash?: string | null;
}

export interface SecurityAlert {
  id: number;
  sequence_number: number;
  timestamp: string;
  user_id?: number | null;
  username: string;
  action: string;
  document_id?: number | null;
  document_title?: string | null;
  status: string;
  ip_address?: string | null;
  details?: string | null;
}

export interface AdminMetrics {
  total_users: number;
  active_users: number;
  active_documents: number;
  storage_bytes: number;
  active_permissions: number;
  total_audit_records: number;
  security_refusals: number;
}

export interface AISuggestedGrant {
  user_id: number;
  username: string;
  full_name: string;
  recommended_level: PermissionLevel;
  confidence_score: number;
  justification: string;
}

export interface AISuggestionResponse {
  document_id: number;
  document_title: string;
  category: string;
  sensitivity: string;
  suggested_grants: AISuggestedGrant[];
  safety_disclaimer: string;
}
