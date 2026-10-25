import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api, ApiError } from '../services/api';

interface Persona {
  id: string;
  name: string;
  role: 'admin' | 'owner' | 'viewer';
  title: string;
  description: string;
  password: string;
}

export const TEST_PERSONAS: Persona[] = [
  {
    id: 'admin',
    name: 'Platform Administrator',
    role: 'admin',
    title: 'Security Officer',
    description: 'System metrics, audit chain verification & account controls (no auto content access)',
    password: 'AdminPassword123!',
  },
  {
    id: 'alice_owner',
    name: 'Alice Walker',
    role: 'owner',
    title: 'Finance Director',
    description: 'Owns executive payroll & contract agreements; manages grants & revokes access',
    password: 'OwnerPassword123!',
  },
  {
    id: 'bob_owner',
    name: 'Bob Miller',
    role: 'owner',
    title: 'Lead Engineer',
    description: 'Owns turbine schematics & engineering blueprints; grants edit rights to peers',
    password: 'OwnerPassword123!',
  },
  {
    id: 'charlie_viewer',
    name: 'Charlie Vance',
    role: 'viewer',
    title: 'Auditor & Legal',
    description: 'Viewer role; accesses documents only with active direct read or edit grant',
    password: 'ViewerPassword123!',
  },
  {
    id: 'eve_attacker',
    name: 'Eve Sterling',
    role: 'viewer',
    title: 'Unauthorized Outlier',
    description: 'Zero document grants; tests IDOR isolation, probe rejections & audit alerts',
    password: 'AttackerPassword123!',
  },
];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: { full_name: string; email: string; username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchPersona: (username: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    const token = localStorage.getItem('trustvault_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.getMe();
      setUser(me);
    } catch {
      localStorage.removeItem('trustvault_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (username: string, password: string) => {
    setError(null);
    try {
      const res = await api.login(username, password);
      setUser(res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Authentication failed. Please verify credentials.');
      }
      throw err;
    }
  };

  const register = async (data: {
    full_name: string;
    email: string;
    username: string;
    password: string;
  }) => {
    setError(null);
    try {
      const res = await api.register(data);
      setUser(res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError('Registration failed. Please check your information.');
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  const switchPersona = async (username: string) => {
    const persona = TEST_PERSONAS.find(p => p.id === username);
    if (!persona) return;
    await login(persona.id, persona.password);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        switchPersona,
        refreshUser,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
