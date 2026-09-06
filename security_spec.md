# Security Specification: Personal Gemini Journal

## 1. Data Invariants
- Every `Conversation` (diary page) must have a single `ownerId` matching `request.auth.uid`.
- Every `Message` must reside under an existing `Conversation` belonging to the same user.
- A user cannot read, write, modify, or delete any other user's conversations or messages.
- A user cannot perform list queries across other users' data; `allow list` explicitly validates `resource.data.ownerId == request.auth.uid`.
- Timestamps must be valid timestamps and immutable fields (`ownerId`, `createdAt`, `conversationId`) cannot be altered after creation.

## 2. The "Dirty Dozen" Adversarial Payloads (TDD Analysis)
1. **Unauthenticated Read:** Requesting `/conversations/{id}` with `auth: null` -> Denied.
2. **IDOR Read:** User A reading `/conversations/{userBConv}` -> Denied (`resource.data.ownerId != request.auth.uid`).
3. **IDOR Write:** User A creating `/conversations/{id}` with `ownerId: "userB"` -> Denied (`incoming().ownerId != request.auth.uid`).
4. **IDOR Subcollection Write:** User A inserting `/conversations/{userBConv}/messages/{msgId}` -> Denied (parent conversation check fails).
5. **Ghost Field Poisoning:** Creating a conversation with extra unverified fields like `isAdmin: true` -> Denied by strict keys size check.
6. **ID Poisoning / Oversized Path:** Using a 10KB string as `{conversationId}` -> Denied by `isValidId()`.
7. **Title Flooding:** Conversation with `title.size() > 120` -> Denied.
8. **Message Payload Flooding:** Message with `content.size() > 10000` -> Denied.
9. **Role Injection:** Message with `role: "system"` or `role: "superadmin"` -> Denied (`role` must be 'user' or 'assistant').
10. **Immutable Owner Tampering:** Updating an existing conversation to transfer `ownerId` -> Denied (`incoming().ownerId == existing().ownerId`).
11. **Client-Side Query Scraping:** Unfiltered query without user match -> Denied by rule-level list check.
12. **Cross-User Message List:** Querying another user's message subcollection -> Denied.
