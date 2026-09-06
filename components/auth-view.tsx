'use client';

import React from 'react';
import { BookOpen, Shield, Sparkles, Lock, ArrowRight } from 'lucide-react';

interface AuthViewProps {
  onSignIn: () => Promise<void>;
  authError: string | null;
  loading: boolean;
}

export function AuthView({ onSignIn, authError, loading }: AuthViewProps) {
  const [isSigningIn, setIsSigningIn] = React.useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await onSignIn();
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#FAF9F5] text-[#262522]">
      {/* Decorative subtle border card representing an authentic notebook cover */}
      <div className="w-full max-w-md bg-[#FFFDF9] border border-[#E7E2D6] rounded-2xl shadow-[0_4px_24px_rgba(45,35,20,0.06)] p-8 sm:p-10 relative overflow-hidden">
        {/* Subtle top spine accent line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#D5CEBF] via-[#8C8270] to-[#D5CEBF]" />

        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center space-y-3 mb-8">
          <div className="w-14 h-14 rounded-full bg-[#F4EFE6] flex items-center justify-center text-[#5C5240] border border-[#E0D7C6]">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-semibold tracking-tight text-[#1F1E1B]">
              Personal Gemini Journal
            </h1>
            <p className="mt-2 text-sm text-[#736B5E] max-w-xs leading-relaxed">
              A private, contemplative space to reflect honestly on your thoughts, decisions, and patterns.
            </p>
          </div>
        </div>

        {/* Core Principles */}
        <div className="space-y-3 mb-8 bg-[#FAF7F0] p-4 rounded-xl border border-[#EAE3D4] text-xs text-[#595245]">
          <div className="flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-[#8C8270] mt-0.5 shrink-0" />
            <span>
              <strong>Zero-Trust Architecture:</strong> Your journal pages are privately owned and isolated with cryptographic tokens and strict server authorization.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#8C8270] mt-0.5 shrink-0" />
            <span>
              <strong>Contemplative AI:</strong> Gemini acts as a thoughtful sounding board to help you discover insights, not a generic chatbot.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-[#8C8270] mt-0.5 shrink-0" />
            <span>
              <strong>Durable Cloud Persistence:</strong> Every page is securely saved in Cloud Firestore under your authenticated user ID.
            </span>
          </div>
        </div>

        {/* Error notification if any */}
        {authError && (
          <div className="mb-6 p-3 rounded-lg bg-[#FDF2F0] border border-[#F5C2BC] text-xs text-[#A82B24] leading-relaxed">
            {authError}
          </div>
        )}

        {/* Sign In CTA */}
        <div className="space-y-4">
          <button
            id="google-signin-button"
            type="button"
            onClick={handleSignIn}
            disabled={isSigningIn || loading}
            className="w-full py-3.5 px-4 bg-[#2C2824] hover:bg-[#1A1816] text-[#FAF8F5] rounded-xl font-medium text-sm transition-all duration-150 flex items-center justify-center gap-3 shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none"
          >
            {/* Google G SVG */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isSigningIn ? 'Connecting to diary...' : 'Sign in with Google'}</span>
            {!isSigningIn && <ArrowRight className="w-4 h-4 ml-auto opacity-70" />}
          </button>

          <p className="text-center text-[11px] text-[#8C8476]">
            By signing in, you access your personal encrypted journal records.
          </p>
        </div>
      </div>
    </div>
  );
}
