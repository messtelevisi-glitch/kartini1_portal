import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../../lib/firebase';
import {
  apiRequest,
  setFirebaseTokenGetter,
  setStaffToken,
} from '../../services/api';
import type { AuthUser } from '../../types/exam';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  hasClaimedAdmin: boolean;
  schoolName: string;
  loginWithCredentials: (
    identifier: string,
    password: string,
    expectedRole?: 'admin' | 'teacher' | 'any'
  ) => Promise<AuthUser>;
  claimInitialAdmin: (payload: {
    username: string;
    email: string;
    fullName: string;
    password: string;
  }) => Promise<AuthUser>;
  loginWithGoogle: () => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  hasClaimedAdmin: true,
  schoolName: 'SMP Kartini 1 Batam',
  loginWithCredentials: async () => {
    throw new Error('AuthProvider missing');
  },
  claimInitialAdmin: async () => {
    throw new Error('AuthProvider missing');
  },
  loginWithGoogle: async () => {
    throw new Error('AuthProvider missing');
  },
  logout: async () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasClaimedAdmin, setHasClaimedAdmin] = useState(true);
  const [schoolName, setSchoolName] = useState('SMP Kartini 1 Batam');

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiRequest<{
        hasClaimedAdmin: boolean;
        schoolName: string;
      }>('/api/auth/bootstrap-status', {}, 'public');
      setHasClaimedAdmin(data.hasClaimedAdmin);
      if (data.schoolName) setSchoolName(data.schoolName);
    } catch {
      // Ignore transient status fetch failure
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();

    setFirebaseTokenGetter(async () => {
      const fbUser = auth.currentUser;
      if (!fbUser) return null;
      return fbUser.getIdToken();
    });

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await apiRequest<{ user: AuthUser }>(
            '/api/auth/firebase',
            {
              method: 'POST',
              body: JSON.stringify({ idToken }),
            },
            'public'
          );
          setUser(res.user);
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [refreshBootstrap]);

  const loginWithCredentials = async (
    identifier: string,
    password: string,
    expectedRole: 'admin' | 'teacher' | 'any' = 'any'
  ) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ identifier, password, expectedRole }),
      },
      'public'
    );
    setStaffToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const claimInitialAdmin = async (payload: {
    username: string;
    email: string;
    fullName: string;
    password: string;
  }) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>(
      '/api/auth/claim-admin',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'public'
    );
    setStaffToken(res.token);
    setUser(res.user);
    setHasClaimedAdmin(true);
    return res.user;
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    const res = await apiRequest<{ user: AuthUser }>(
      '/api/auth/firebase',
      {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      },
      'public'
    );
    setStaffToken(null);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    setStaffToken(null);
    setUser(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        hasClaimedAdmin,
        schoolName,
        loginWithCredentials,
        claimInitialAdmin,
        loginWithGoogle,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
