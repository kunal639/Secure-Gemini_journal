export type MemoryType =
  | 'PATTERN'
  | 'PREFERENCE'
  | 'GOAL'
  | 'EVENT';

export interface MemoryCandidate {
  type: MemoryType;
  content: string;
}

export interface MemoryExtractionResult {
  memories: MemoryCandidate[];
}

export interface JournalMemory extends MemoryCandidate {
  id: string;
  ownerId: string;
  sourceConversationId: string;
  sourceMessageId: string;
  createdAt: string;
  updatedAt: string;
}