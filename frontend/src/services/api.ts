import {
  User,
  TokenResponse,
  Document,
  DocumentSensitivity,
  PermissionLevel,
  PermissionEntry,
  AuditLogEntry,
  AuditVerificationResult,
  SecurityAlert,
  AdminMetrics,
  AISuggestionResponse,
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('trustvault_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = {
    ...getAuthHeader(),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        errorDetail = errorJson.detail;
      }
    } catch {
      // Fallback to text or status text
    }
    throw new ApiError(response.status, errorDetail);
  }

  // Handle 204 or empty responses
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // Authentication
  async login(username: string, password: string): Promise<TokenResponse> {
    const res = await request<TokenResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem('trustvault_token', res.access_token);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('trustvault_token');
    }
  },

  async getMe(): Promise<User> {
    return request<User>('/auth/me');
  },

  // Health
  async getHealth(): Promise<{ status: string; database: string; storage: string; timestamp: string }> {
    return request('/health');
  },

  // Users Management
  async listUsers(): Promise<User[]> {
    return request<User[]>('/users');
  },

  async createUser(data: {
    username: string;
    email: string;
    full_name: string;
    role: string;
    password: string;
  }): Promise<User> {
    return request<User>('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async toggleUserStatus(userId: number, isActive: boolean): Promise<{ message: string; is_active: boolean }> {
    const formData = new FormData();
    formData.append('is_active', String(isActive));
    return request(`/users/${userId}/status`, {
      method: 'PUT',
      body: formData,
    });
  },

  // Documents
  async listDocuments(params?: {
    search?: string;
    category?: string;
    owner?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<Document[]> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.category) query.append('category', params.category);
    if (params?.owner) query.append('owner', params.owner);
    if (params?.start_date) query.append('start_date', params.start_date);
    if (params?.end_date) query.append('end_date', params.end_date);

    const qs = query.toString();
    return request<Document[]>(`/documents${qs ? `?${qs}` : ''}`);
  },

  async getDocument(id: number): Promise<Document> {
    return request<Document>(`/documents/${id}`);
  },

  async uploadDocument(data: {
    title: string;
    category: string;
    sensitivity: DocumentSensitivity;
    file: File;
  }): Promise<Document> {
    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('category', data.category);
    formData.append('sensitivity', data.sensitivity);
    formData.append('file', data.file);

    return request<Document>('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  async updateDocument(
    id: number,
    data: { title?: string; category?: string; sensitivity?: DocumentSensitivity }
  ): Promise<Document> {
    return request<Document>(`/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async updateDocumentContent(id: number, file: File): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    return request<Document>(`/documents/${id}/content`, {
      method: 'PUT',
      body: formData,
    });
  },

  async deleteDocument(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/documents/${id}`, {
      method: 'DELETE',
    });
  },

  async downloadDocument(id: number, filename: string): Promise<void> {
    const headers = {
      ...getAuthHeader(),
    };

    const response = await fetch(`${API_BASE}/documents/${id}/download`, {
      headers,
    });

    if (!response.ok) {
      let errorDetail = `Download failed (${response.status})`;
      try {
        const errorJson = await response.json();
        if (errorJson.detail) errorDetail = errorJson.detail;
      } catch {
        // Fallback
      }
      throw new ApiError(response.status, errorDetail);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Permissions & Sharing
  async listPermissions(documentId: number): Promise<PermissionEntry[]> {
    return request<PermissionEntry[]>(`/documents/${documentId}/permissions`);
  },

  async grantPermission(
    documentId: number,
    targetUsernameOrId: string,
    permissionLevel: PermissionLevel
  ): Promise<{ message: string; target_user_id: number; permission_level: PermissionLevel }> {
    return request(`/documents/${documentId}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_username_or_id: targetUsernameOrId,
        permission_level: permissionLevel,
      }),
    });
  },

  async revokePermission(
    documentId: number,
    targetUserId: number
  ): Promise<{ message: string; revoked_user_id: number }> {
    return request(`/documents/${documentId}/permissions/${targetUserId}`, {
      method: 'DELETE',
    });
  },

  // AI Assistant
  async getAISuggestions(documentId: number): Promise<AISuggestionResponse> {
    return request<AISuggestionResponse>(`/documents/${documentId}/ai-suggest`, {
      method: 'POST',
    });
  },

  async confirmAISuggestion(
    documentId: number,
    targetUsernameOrId: string,
    permissionLevel: PermissionLevel
  ): Promise<{ message: string }> {
    return request(`/documents/${documentId}/ai-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_username_or_id: targetUsernameOrId,
        permission_level: permissionLevel,
      }),
    });
  },

  // Audit & Verification
  async getAuditTrail(documentId?: number, limit = 100): Promise<AuditLogEntry[]> {
    const qs = documentId ? `?document_id=${documentId}&limit=${limit}` : `?limit=${limit}`;
    return request<AuditLogEntry[]>(`/audit${qs}`);
  },

  async verifyAuditChain(): Promise<AuditVerificationResult> {
    return request<AuditVerificationResult>('/audit/verify');
  },

  async getSecurityAlerts(): Promise<SecurityAlert[]> {
    return request<SecurityAlert[]>('/audit/alerts');
  },

  async getAdminMetrics(): Promise<AdminMetrics> {
    return request<AdminMetrics>('/admin/metrics');
  },
};
