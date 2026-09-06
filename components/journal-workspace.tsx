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
  Plus,
  LogOut,
  Sparkles,
  BookOpen,
  Calendar,
  Send,
  Trash2,
  Menu,
  X,
  AlertCircle,
  Clock,
  ShieldCheck,
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
  if (diffDays > 1 && diffDays <= 7) return 'Previous 7 Days';
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

  // 1. Listen for user's conversations in Firestore in real-time
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

        // Select the active conversation (preserving saved session ID on refresh if valid)
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
        setErrorMessage('Unable to load your journal pages. Please verify your connection.');
      }
    );

    return () => unsubscribe();
  }, [user]);

  const isPersisted = conversations.some((c) => c.id === activeConversationId);

  // Save active conversation ID in sessionStorage for browser refresh persistence
  useEffect(() => {
    if (activeConversationId && isPersisted) {
      try {
        sessionStorage.setItem('last_active_page_id', activeConversationId);
      } catch {
        // ignore
      }
    }
  }, [activeConversationId, isPersisted]);

  // Derived loading state: true when a persisted conversation is selected but its messages have not finished loading
  const isLoadingHistory = Boolean(
    isPersisted && activeConversationId && loadedConversationId !== activeConversationId
  );

  // 2. Listen for messages of active conversation
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

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Handle auto-resizing of textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  };

  // 3. Action: Create New Page
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

  // 4. Action: Switch Page
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

  // 5. Action: Delete a Page (True Cascade Deletion via Server)
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

  // 6. Action: Send Journal Entry
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

    // Optimistic UI update for fluid user feedback
    startTransition(() => {
      setMessages((prev) => [...prev, optimisticUserMessage]);
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });

    setIsSending(true);

    try {
      // Obtain fresh Firebase ID token for secure backend authentication
      const token = await getIdToken();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      // FIX 1: History is database-authoritative. Client does NOT send history payload.
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

      // If successful, assistant response is returned and already persisted in Firestore
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

  // Group conversations by date
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

  // Helper to format timestamps cleanly
  const formatTime = (dateVal: any) => {
    if (!dateVal) return '';
    const d = typeof dateVal?.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'Current Entry';
    const d = typeof dateVal?.toDate === 'function' ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return 'Current Entry';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#FAF9F5] text-[#262522]">
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-xs md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ========================================================= */}
      {/* LEFT SIDEBAR: Journal Pages History */}
      {/* ========================================================= */}
      <aside
        id="journal-sidebar"
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 sm:w-80 bg-[#F4F1EA] border-r border-[#E5E0D4] flex flex-col transition-transform duration-200 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[#E5E0D4] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EAE4D6] flex items-center justify-center text-[#5A5040] border border-[#DDD5C5]">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif font-semibold text-sm text-[#201D1A]">Personal Journal</h2>
              <p className="text-[11px] text-[#7A7264]">Pages & Reflections</p>
            </div>
          </div>
          <button
            type="button"
            className="md:hidden p-1.5 rounded-lg text-[#7A7264] hover:bg-[#EAE4D6]"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Page CTA Button */}
        <div className="p-3">
          <button
            id="new-page-button"
            type="button"
            onClick={handleNewPage}
            className="w-full py-2.5 px-3.5 bg-[#EAE4D6] hover:bg-[#E0D8C8] text-[#332D24] rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-colors border border-[#D9D0BE] shadow-xs active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" />
            <span>New Page</span>
          </button>
        </div>

        {/* Previous Pages List Grouped by Date */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-[#8C8270] leading-relaxed">
              No pages recorded yet.
              <br />
              Click &ldquo;New Page&rdquo; to start your first reflection.
            </div>
          ) : (
            groupedConversations.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-[#8C8270]">
                  {group.label}
                </div>
                {group.items.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      id={`page-item-${conv.id}`}
                      onClick={() => handleSelectPage(conv.id)}
                      className={`group relative flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                        isActive
                          ? 'bg-[#E3DCCE] text-[#1E1C19] font-medium shadow-xs border border-[#D4CAB6]'
                          : 'text-[#575043] hover:bg-[#EBE5D8] hover:text-[#1E1C19]'
                      }`}
                    >
                      <PenLine className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#8C8270]" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-serif leading-snug">{conv.title}</p>
                        <span className="text-[10px] text-[#8C8270] flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDate(conv.updatedAt || conv.createdAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        title="Delete page"
                        onClick={(e) => handleDeletePage(e, conv.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[#8C8270] hover:text-[#A82B24] rounded-md transition-opacity"
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

        {/* User Account / Sign Out Footer */}
        <div className="p-3 border-t border-[#E5E0D4] bg-[#EFECE3] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#DCD4C2] flex items-center justify-center text-xs font-medium text-[#4A4234] shrink-0 border border-[#D5CDBC]">
              {(user.displayName || user.email || 'U')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#201D1A] truncate">
                {user.displayName || 'Journal Keeper'}
              </p>
              <p className="text-[10px] text-[#7A7264] truncate">{user.email}</p>
            </div>
          </div>
          <button
            id="signout-button"
            type="button"
            title="Sign out"
            onClick={onSignOut}
            className="p-1.5 text-[#7A7264] hover:text-[#201D1A] hover:bg-[#E2DCCE] rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN WORKSPACE: Active Journal Page */}
      {/* ========================================================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Page Top Bar */}
        <header className="h-14 px-4 sm:px-8 border-b border-[#EBE6DC] bg-[#FAF9F5]/90 backdrop-blur-xs flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden p-1.5 rounded-lg text-[#665E50] hover:bg-[#EFECE3]"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#8C8270]" />
              <h1 className="font-serif font-medium text-sm sm:text-base text-[#201D1A] truncate">
                {activeConv ? activeConv.title : 'New Page'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#8C8270]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#4D7A58]" />
            <span className="hidden sm:inline text-[11px]">Encrypted & Isolated</span>
          </div>
        </header>

        {/* Error Banner if any */}
        {errorMessage && (
          <div className="mx-4 sm:mx-8 mt-3 p-3 rounded-xl bg-[#FDF2F0] border border-[#F5C2BC] text-xs text-[#A82B24] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              className="text-[11px] underline font-medium hover:text-[#7A1C16]"
              onClick={() => setErrorMessage(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Conversation Stream */}
        <div
          id="journal-stream"
          className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-3xl w-full mx-auto space-y-6"
        >
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-20 text-xs text-[#8C8270] gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-[#8C8270] border-t-transparent animate-spin" />
              <span>Opening your journal page...</span>
            </div>
          ) : messages.length === 0 ? (
            /* Blank New Page Welcome Slate */
            <div className="py-16 text-center max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#F4EFE6] border border-[#E0D7C6] flex items-center justify-center mx-auto text-[#736A58]">
                <PenLine className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif font-medium text-[#26231E]">A Fresh Page</h3>
              <p className="text-xs sm:text-sm text-[#736B5E] leading-relaxed">
                What is currently on your mind? Write freely about a thought, dilemma, decision, or feeling.
                Gemini will reflect with you honestly and calmly.
              </p>
              <div className="pt-2 text-[11px] text-[#9E9584]">
                Tip: Write as much detail as you need. Press Enter to share your reflection.
              </div>
            </div>
          ) : (
            /* Vertically Flowing Journal Entries */
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  id={`message-${msg.id}`}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 sm:p-5 transition-all ${
                      isUser
                        ? 'bg-[#F2ECE1] text-[#24211D] border border-[#E2DAC9] rounded-br-xs shadow-xs'
                        : 'bg-[#FFFDF9] text-[#292622] border border-[#E8E3D8] rounded-bl-xs shadow-xs'
                    }`}
                  >
                    {/* Header Label: Author & Timestamp */}
                    <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-[#EAE3D4]/60 text-[11px] text-[#7A7264]">
                      {isUser ? (
                        <>
                          <span className="font-semibold text-[#3D372E]">Your Entry</span>
                          <span>·</span>
                          <span>{formatTime(msg.createdAt)}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-[#6A604D]" />
                          <span className="font-serif font-medium text-[#4D4537]">Gemini Reflection</span>
                          <span>·</span>
                          <span>{formatTime(msg.createdAt)}</span>
                        </>
                      )}
                    </div>

                    {/* Message Body Content rendered cleanly and safely */}
                    <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Active Contemplative Breathing / Thinking Indicator */}
          {isSending && (
            <div className="flex flex-col items-start max-w-[85%]">
              <div className="rounded-2xl p-4 bg-[#FFFDF9] border border-[#E8E3D8] text-[#7A7264] text-xs flex items-center gap-3 shadow-xs">
                <Sparkles className="w-4 h-4 text-[#8C8270] animate-pulse" />
                <span className="font-serif italic">Gemini is quietly reflecting on your entry...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input Console */}
        <div className="border-t border-[#EBE6DC] bg-[#FAF9F5] p-3 sm:p-4 max-w-3xl w-full mx-auto">
          <div className="relative bg-[#FFFDF9] border border-[#DDD6C7] focus-within:border-[#A89E8D] focus-within:ring-2 focus-within:ring-[#A89E8D]/15 rounded-2xl p-3 shadow-xs transition-all">
            <textarea
              id="journal-input-textarea"
              ref={textareaRef}
              rows={2}
              value={inputText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              placeholder="Reflect on your day, a thought, or how you are feeling... (Enter to send, Shift+Enter for new line)"
              className="w-full resize-none bg-transparent border-0 text-xs sm:text-sm text-[#262522] placeholder-[#9E9687] focus:outline-hidden focus:ring-0 leading-relaxed font-sans max-h-56"
            />

            <div className="flex items-center justify-between pt-2 border-t border-[#F2ECE1] text-[11px] text-[#9E9687]">
              <span>
                {inputText.length} / 10,000 chars
              </span>

              <button
                id="send-reflection-button"
                type="button"
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isSending}
                className="py-1.5 px-3.5 bg-[#2C2824] hover:bg-[#1A1816] text-[#FAF8F5] rounded-xl font-medium flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] shadow-xs"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
