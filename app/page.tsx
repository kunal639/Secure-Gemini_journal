'use client';

import React from 'react';
import { useJournalAuth } from '@/hooks/use-journal-auth';
import { AuthView } from '@/components/auth-view';
import { JournalWorkspace } from '@/components/journal-workspace';
import { BookOpen } from 'lucide-react';

export default function HomePage() {
  const { user, loading, authError, signInWithGoogle, signOutUser, getIdToken } = useJournalAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF9F5] text-[#262522]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#F4EFE6] border border-[#E0D7C6] flex items-center justify-center text-[#736A58] animate-pulse">
            <BookOpen className="w-6 h-6" />
          </div>
          <p className="font-serif text-sm text-[#736B5E] italic">
            Opening your personal journal...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        onSignIn={signInWithGoogle}
        authError={authError}
        loading={loading}
      />
    );
  }

  return (
    <JournalWorkspace
      user={user}
      onSignOut={signOutUser}
      getIdToken={getIdToken}
    />
  );
}
