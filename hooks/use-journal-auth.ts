'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

export function useJournalAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      (error) => {
        console.error('Firebase Auth state change error:', error);
        setAuthError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Sign-in error:', error);
      if (error.code === 'auth/popup-blocked') {
        setAuthError('Sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in was cancelled. Please click sign-in to continue.');
      } else {
        setAuthError(error.message || 'Failed to authenticate with Google.');
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error('Sign-out error:', error);
      setAuthError(error.message || 'Failed to sign out.');
    }
  }, []);

  const getIdToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken(forceRefresh);
  }, []);

  return {
    user,
    loading,
    authError,
    signInWithGoogle,
    signOutUser,
    getIdToken,
  };
}
