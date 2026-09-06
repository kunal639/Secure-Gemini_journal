'use client';

import React, { useState, useEffect, useRef, useTransition, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  PenLine,
  LogOut,
  Sparkles,
  BookOpen,
  Send,
  Trash2,
  Menu,
  X,
  AlertCircle,
  Clock,
  Bookmark,
  Feather,
} from 'lucide-react';

export interface JournalConversation {
  id: string;
  ownerId: string;
  title: string;
  createdAt: any;
  updatedAt: any;
}

export interface JournalMessage {
  id: string;
  conversationId: string;
  ownerId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: any;
}

interface JournalWorkspaceProps {
  user: User;
  onSignOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
}

function getGroupKey(dateVal: any): string {
  if (!dateVal) return 'Earlier';
  const d = typeof dateVal?.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
  if (isNaN(d.getTime())) return 'Earlier';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entryDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffMs = today.getTime() - entryDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return 'This Past Week';
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-US', { month: 'long' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function JournalWorkspace({ user, onSignOut, getIdToken }: JournalWorkspaceProps) {
  const [conversations, setConversations] = useState<JournalConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JournalMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [, startTransition] = useTransition();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Real-time Firestore subscription
  useEffect(() => {
    if (!user) return;

    const convsRef = collection(db, 'conversations');
    const q = query(
      convsRef,
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: JournalConversation[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            ownerId: data.ownerId,
            title: data.title || 'Untitled Reflection',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          });
        });

        setConversations(list);

        setActiveConversationId((prev) => {
          if (prev) return prev;
          let savedId: string | null = null;
          try {
            savedId = sessionStorage.getItem('last_active_page_id');
          } catch {
            // ignore
          }
          if (savedId && list.some((c) => c.id === savedId)) {
            return savedId;
          }
          if (list.length > 0) {
            return list[0].id;
          }
          return null;
        });
      },
      (err) => {
        console.error('Failed to subscribe to conversations:', err);
        setErrorMessage('Unable to load your journal pages. Please check your connection.');
      }
    );

    return () => unsubscribe();
  }, [user]);

  const isPersisted = conversations.some((c) => c.id === activeConversationId);

  useEffect(() => {
    if (activeConversationId && isPersisted) {
      try {
        sessionStorage.setItem('last_active_page_id', activeConversationId);
      } catch {
        // ignore
      }
    }
  }, [activeConversationId, isPersisted]);

  const isLoadingHistory = Boolean(
    isPersisted && activeConversationId && loadedConversationId !== activeConversationId
  );

  // 2. Real-time messages subscription
  useEffect(() => {
    if (!activeConversationId || !user || !isPersisted) {
      return;
    }

    let isCurrent = true;

    const messagesRef = collection(db, 'conversations', activeConversationId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isCurrent) return;
        const loaded: JournalMessage[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          loaded.push({
            id: docSnap.id,
            conversationId: activeConversationId,
            ownerId: data.ownerId,
            role: data.role,
            content: data.content,
            createdAt: data.createdAt,
          });
        });

        setMessages(loaded);
        setLoadedConversationId(activeConversationId);
      },
      (err) => {
        if (!isCurrent) return;
        console.error('Failed to subscribe to messages:', err);
        setErrorMessage('Failed to load entries for this page.');
        setLoadedConversationId(activeConversationId);
      }
    );

    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [activeConversationId, user, isPersisted]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  };

  const handleNewPage = () => {
    const newId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setLoadedConversationId(null);
    setActiveConversationId(newId);
    setMessages([]);
    setInputText('');
    setErrorMessage(null);
    setIsSidebarOpen(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSelectPage = (pageId: string) => {
    if (pageId === activeConversationId) {
      setIsSidebarOpen(false);
      return;
    }
    setMessages([]);
    setActiveConversationId(pageId);
    setErrorMessage(null);
    setIsSidebarOpen(false);
  };

  const handleDeletePage = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this journal page and all its entries? This cannot be undone.')) {
      return;
    }

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete journal page.');
      }

      if (activeConversationId === conversationId) {
        const remaining = conversations.filter((c) => c.id !== conversationId);
        setLoadedConversationId(null);
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
        setMessages([]);
      }
    } catch (err: any) {
      console.error('Error deleting page:', err);
      setErrorMessage(err.message || 'Failed to delete page. Please try again.');
    }
  };

  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    setErrorMessage(null);
    const convId = activeConversationId || `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (!activeConversationId) {
      setActiveConversationId(convId);
    }

    const clientMsgId = `msg_usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticUserMessage: JournalMessage = {
      id: clientMsgId,
      conversationId: convId,
      ownerId: user.uid,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    startTransition(() => {
      setMessages((prev) => [...prev, optimisticUserMessage]);
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });

    setIsSending(true);

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: convId,
          message: trimmed,
          userMessageId: clientMsgId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to receive reflection from Gemini.');
      }

      if (data.assistantMessage) {
        startTransition(() => {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === data.assistantMessage.id);
            if (exists) return prev;
            return [...prev, data.assistantMessage];
          });
        });
      }
    } catch (err: any) {
      console.error('Send error:', err);
      setErrorMessage(err.message || 'Failed to complete journal turn.');
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  const groupedConversations = useMemo(() => {
    const groups: { label: string; items: JournalConversation[] }[] = [];
    const map = new Map<string, JournalConversation[]>();

    for (const conv of conversations) {
      const key = getGroupKey(conv.updatedAt || conv.createdAt);
      if (!map.has(key)) {
        map.set(key, []);
        groups.push({ label: key, items: map.get(key)! });
      }
      map.get(key)!.push(conv);
    }

    return groups;
  }, [conversations]);

  const formatTime = (dateVal: any) => {
    if (!dateVal) return '';
    const d = typeof dateVal?.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  };

  const formatDateLong = (dateVal: any) => {
    if (!dateVal) return 'Fresh Leaf';
    const d = typeof dateVal?.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return 'Fresh Leaf';
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateShort = (dateVal: any) => {
    if (!dateVal) return '';
    const d = typeof dateVal?.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F2EDE2] text-[#1A1612] antialiased">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-[#1A1612]/50 backdrop-blur-xs md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ========================================================= */}
      {/* DIARY INDEX (LEFT BOOK SPINE / TABLE OF CONTENTS) */}
      {/* ========================================================= */}
      <aside
        id="journal-sidebar"
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 sm:w-80 bg-[#EBE4D5] border-r-4 border-double border-[#D5C8B4] flex flex-col transition-transform duration-200 ease-in-out shadow-[4px_0_20px_rgba(40,30,20,0.06)] ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Leather-like Header / Book Crest */}
        <div className="p-5 border-b border-[#D5C8B4] flex items-center justify-between bg-[#E4DBC9]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[#D8CEBA] flex items-center justify-center text-[#3B3020] border border-[#C5B8A1] shadow-inner">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-base tracking-tight text-[#1E1710]">
                The Journal
              </h2>
              <p className="text-[11px] font-mono font-medium text-[#5F5240]">Personal Chronology</p>
            </div>
          </div>
          <button
            type="button"
            className="md:hidden p-1.5 rounded-lg text-[#5F5240] hover:bg-[#D8CEBA] cursor-pointer"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Turn Page / New Leaf CTA */}
        <div className="p-3.5">
          <button
            id="new-page-button"
            type="button"
            onClick={handleNewPage}
            className="w-full py-2.5 px-4 bg-[#FAF8F3] hover:bg-[#FFFFFF] text-[#241C13] rounded-lg font-serif font-semibold text-sm flex items-center justify-center gap-2 transition-all border border-[#C8BBA5] shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:scale-[0.99] group cursor-pointer"
          >
            <Feather className="w-4 h-4 text-[#75624A] group-hover:rotate-12 transition-transform" />
            <span>Open New Page</span>
          </button>
        </div>

        {/* Chronological Table of Contents */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-4">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-xs font-serif italic text-[#6B5D49] leading-relaxed">
              An unwritten volume.
              <br />
              Begin by pressing &ldquo;Open New Page&rdquo;.
            </div>
          ) : (
            groupedConversations.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-mono font-semibold tracking-wider uppercase text-[#6B5D49]">
                  — {group.label}
                </div>
                {group.items.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      id={`page-item-${conv.id}`}
                      onClick={() => handleSelectPage(conv.id)}
                      className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#FAF8F3] text-[#120E0A] shadow-[0_1px_5px_rgba(40,30,20,0.08)] border-l-4 border-[#6E593E] pl-2.5'
                          : 'text-[#3E3427] hover:bg-[#E2D8C6] hover:text-[#120E0A]'
                      }`}
                    >
                      <Bookmark
                        className={`w-3.5 h-3.5 mt-1 shrink-0 ${
                          isActive ? 'text-[#6E593E] fill-[#6E593E]' : 'text-[#96866E]'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-serif font-semibold leading-snug">
                          {conv.title}
                        </p>
                        <span className="text-[11px] font-mono font-medium text-[#6B5E4C] flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {formatDateShort(conv.updatedAt || conv.createdAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        title="Delete page"
                        onClick={(e) => handleDeletePage(e, conv.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[#877864] hover:text-[#A8281D] transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Diary Owner Footer */}
        <div className="p-3 border-t border-[#D5C8B4] bg-[#E4DBC9]/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#D0C4AF] flex items-center justify-center text-xs font-serif font-bold text-[#322718] shrink-0 border border-[#BAAB94]">
              {(user.displayName || user.email || 'J')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-serif font-bold text-[#1E1710] truncate">
                {user.displayName || 'The Author'}
              </p>
              <p className="text-[10px] font-mono font-medium text-[#635543] truncate">{user.email}</p>
            </div>
          </div>
          <button
            id="signout-button"
            type="button"
            title="Sign out"
            onClick={onSignOut}
            className="p-1.5 text-[#635543] hover:text-[#1E1710] hover:bg-[#D5C8B4] rounded-md transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* DIARY LEAF WORKSPACE (MAIN WRITING DESK) */}
      {/* ========================================================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#F4EFE6]">
        {/* Top Folio Strip */}
        <header className="h-14 px-4 sm:px-8 border-b border-[#DCD0BE] bg-[#FAF8F3]/90 backdrop-blur-xs flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden p-1.5 rounded-lg text-[#524433] hover:bg-[#E7DFCFC7] cursor-pointer"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-serif italic font-medium text-xs sm:text-sm text-[#665744]">Page:</span>
              <h1 className="font-serif font-bold text-sm sm:text-base text-[#1A150F] tracking-tight truncate max-w-xs sm:max-w-md">
                {activeConv ? activeConv.title : 'Unbound Leaf'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-[#665744]">
            <span className="hidden sm:inline bg-[#E8DFCF] border border-[#CBBCA7] text-[#443828] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#465A3E] animate-pulse" />
              Gemini 2.5 Flash
            </span>
            <span className="hidden md:inline text-[#AFA18D]">|</span>
            <span className="font-serif font-medium italic text-xs">{formatDateLong(activeConv?.updatedAt || activeConv?.createdAt)}</span>
          </div>
        </header>

        {/* Error notification banner */}
        {errorMessage && (
          <div className="mx-4 sm:mx-8 mt-3 p-3 rounded-lg bg-[#FAF0ED] border border-[#ECC0B8] text-xs font-medium text-[#9E281F] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              className="text-[11px] font-bold underline hover:text-[#681912] cursor-pointer"
              onClick={() => setErrorMessage(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Journal Leaf Body (Lined Paper Container) */}
        <div
          id="journal-stream"
          className="flex-1 overflow-y-auto notebook-ruled px-4 sm:px-12 py-8 max-w-3xl w-full mx-auto shadow-[0_0_24px_rgba(50,40,25,0.03)] border-x border-[#E2D8C7] my-0 sm:my-2 rounded-t-sm"
        >
          {isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center py-28 text-sm font-serif italic font-medium text-[#665744] gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-[#665744] border-t-transparent animate-spin" />
              <span>Turning to page...</span>
            </div>
          ) : messages.length === 0 ? (
            /* Blank Parchment Invitation with High-Contrast Prompt Chips */
            <div className="py-16 text-center max-w-lg mx-auto space-y-4">
              <div className="w-11 h-11 rounded-full bg-[#E5DCcb] border border-[#C5B8A1] flex items-center justify-center mx-auto text-[#483B2A]">
                <PenLine className="w-5 h-5" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-[#1F170F]">An Open Leaf</h3>
              <p className="text-sm font-serif italic text-[#4D4030] leading-relaxed">
                Write freely. Gemini reflects calmly alongside your thoughts, revealing subtle assumptions and longitudinal patterns over time.
              </p>

              {/* High-visibility prompt starters */}
              <div className="pt-3 flex flex-wrap justify-center gap-2">
                {[
                  "I'm spending hours learning backend development, but wonder if I'm making meaningful progress.",
                  "Just logging this: finished configuring my database schemas.",
                  "I'm feeling conflicted about whether to take on another project right now."
                ].map((promptText, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInputText(promptText)}
                    className="text-xs font-serif italic font-medium bg-[#EFE9DD] hover:bg-[#E5DDCF] text-[#34291B] border border-[#C7B9A3] px-3.5 py-1.5 rounded-full transition-colors cursor-pointer text-left shadow-xs"
                  >
                    &ldquo;{promptText.length > 56 ? promptText.slice(0, 54) + '...' : promptText}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Continuous Journal Entries Flow */
            <div className="space-y-8">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    id={`message-${msg.id}`}
                    className={`relative transition-all ${
                      isUser
                        ? 'pl-3 sm:pl-5 border-l-2 border-[#7E6A52] my-3'
                        : 'pl-4 sm:pl-7 my-6'
                    }`}
                  >
                    {isUser ? (
                      /* USER ENTRY: High-Contrast Rich Espresso Ink */
                      <div className="relative group">
                        {/* Header: Timestamp & Author */}
                        <div className="flex items-center gap-2 mb-1.5 text-[11px] font-mono text-[#524433]">
                          <span className="font-serif font-bold text-[#2A1E11] tracking-wider uppercase text-[11px]">
                            Your Entry
                          </span>
                          <span>•</span>
                          <span className="font-semibold">{formatTime(msg.createdAt)}</span>
                        </div>

                        {/* Entry Content (Bold, clear, readable serif text) */}
                        <p className="text-base sm:text-lg font-serif text-[#16110B] font-medium leading-relaxed sm:leading-8 whitespace-pre-wrap selection:bg-[#E2D4C0]">
                          {msg.content}
                        </p>
                      </div>
                    ) : (
                      /* GEMINI REFLECTION: Calming Sage Marginalia Card */
                      <div className="relative border-l-4 border-[#41533B] pl-4 py-3 bg-[#EFECE3] rounded-r-xl shadow-[0_1px_4px_rgba(40,45,35,0.04)] border-y border-r border-[#D9D3C5]">
                        {/* Header: Accent Tag & Timestamp */}
                        <div className="flex items-center gap-1.5 mb-1.5 text-xs font-serif text-[#31402C]">
                          <Sparkles className="w-4 h-4 text-[#41533B]" />
                          <span className="font-bold italic text-[#253221]">
                            Contemplative Reflection
                          </span>
                          <span className="text-[11px] font-mono font-medium text-[#4D5E48]">
                            • {formatTime(msg.createdAt)}
                          </span>
                        </div>

                        {/* Reflection Content (Crisp, dark forest-sage text) */}
                        <p className="text-sm sm:text-base font-serif text-[#1C2719] font-normal leading-relaxed italic whitespace-pre-wrap selection:bg-[#D5DFC9]">
                          {msg.content}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Thinking Pen Indicator */}
          {isSending && (
            <div className="pl-4 sm:pl-7 my-5 animate-fade-in">
              <div className="border-l-4 border-[#7A6750] pl-4 py-3 bg-[#EAE3D4]/80 rounded-r-xl text-xs sm:text-sm font-serif italic font-medium text-[#463827] flex items-center justify-between max-w-md border-y border-r border-[#D5C9B5]">
                <div className="flex items-center gap-2.5">
                  <Feather className="w-4 h-4 text-[#66543E] animate-bounce" />
                  <span>Synthesizing journal context & reflecting...</span>
                </div>
                <div className="flex gap-1 pr-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#66543E] animate-ping" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Lined Bottom Writing Console */}
        <div className="border-t border-[#D5C8B4] bg-[#F5EFE4] p-3 sm:p-5 max-w-3xl w-full mx-auto">
          <div className="relative bg-[#FFFFFF] border-2 border-[#CBBDA8] focus-within:border-[#735F48] focus-within:ring-2 focus-within:ring-[#735F48]/15 rounded-xl p-3.5 shadow-xs transition-all">
            <textarea
              id="journal-input-textarea"
              ref={textareaRef}
              rows={2}
              value={inputText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              placeholder="Inscribe your reflection here... (Enter to etch, Shift+Enter for new line)"
              className="w-full resize-none bg-transparent border-0 text-base font-serif text-[#1A140D] font-medium placeholder-[#7D6E5C] focus:outline-hidden focus:ring-0 leading-relaxed max-h-52"
            />

            <div className="flex items-center justify-between pt-2.5 border-t border-[#EAE1D1] text-[11px] font-mono font-medium text-[#6E5E4A]">
              <div className="flex items-center gap-3">
                <span>{inputText.length} / 10,000 chars</span>
                <span className="hidden sm:inline-block text-[#8F7E69]">• Press ↵ to etch</span>
              </div>

              <button
                id="send-reflection-button"
                type="button"
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isSending}
                className="py-1.5 px-4 bg-[#281F15] hover:bg-[#120D08] text-[#FAF8F5] rounded-lg font-serif font-semibold text-xs tracking-wide flex items-center gap-2 transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98] shadow-xs cursor-pointer"
              >
                <span>Inscribe</span>
                <Send className="w-3.5 h-3.5 text-[#DBCFBE]" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}