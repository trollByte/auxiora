# Phase 1 Implementation: Email Intelligence + Microsoft 365

## Packages to Create/Modify

### 1. `@auxiora/connector-microsoft` (NEW)
Microsoft Graph API connector.

**Files:**
- `package.json` — deps: `@azure/msal-node`, `@microsoft/microsoft-graph-client`
- `tsconfig.json`
- `src/index.ts` — re-exports
- `src/auth.ts` — MSAL OAuth2 with refresh token rotation
- `src/mail.ts` — Mail CRUD: list, read, send, reply, forward, move, archive, flag, search
- `src/calendar.ts` — Calendar: events CRUD, availability, attendees
- `src/contacts.ts` — People API: list, search, get
- `src/onedrive.ts` — Files: list, download, upload, search
- `src/delta-sync.ts` — Delta link tracking for incremental sync
- `src/types.ts` — TypeScript interfaces
- `tests/mail.test.ts`
- `tests/calendar.test.ts`
- `tests/delta-sync.test.ts`

### 2. `@auxiora/email-intelligence` (NEW)
Email brain for triage, smart reply, follow-ups.

**Files:**
- `package.json` — deps: `@auxiora/providers`, `@auxiora/logger`, `@auxiora/audit`
- `tsconfig.json`
- `src/index.ts` — re-exports
- `src/triage.ts` — Priority scoring engine (urgent/action/FYI/spam/newsletter)
- `src/smart-reply.ts` — Draft tone-matched replies using AI
- `src/follow-up.ts` — Detect promises, track follow-ups, generate reminders
- `src/thread-summarizer.ts` — Compress long email chains
- `src/types.ts` — TypeScript interfaces
- `tests/triage.test.ts`
- `tests/smart-reply.test.ts`
- `tests/follow-up.test.ts`

### 3. Enhanced `@auxiora/connector-google-workspace`
Add full mail operations and delta sync.

**Files to modify/add:**
- `src/gmail.ts` — Add: send, reply, forward, move, archive, flag, search, delta sync
- `src/contacts.ts` — Add: list contacts, search, get details
- `tests/gmail-operations.test.ts`

### 4. Email tools registration
New tools for the tool system.

**Files to modify/add:**
- `packages/tools/src/builtins/email-triage.ts` — Show prioritized email summary
- `packages/tools/src/builtins/email-reply.ts` — Draft and send reply
- `packages/tools/src/builtins/email-search.ts` — Search across accounts
- `packages/tools/src/builtins/email-compose.ts` — Compose new email

### 5. Runtime wiring
Wire email intelligence into the ambient loop.

**Files to modify:**
- `packages/runtime/src/index.ts` — Add email sync loop, connect email-intelligence
- `packages/runtime/src/types.ts` — Add email-related config types

## Build Order

1. `connector-microsoft` types + auth (foundation)
2. `connector-microsoft` mail + calendar (core functionality)
3. `email-intelligence` triage + smart-reply (the brain)
4. `email-intelligence` follow-up + thread-summarizer (power features)
5. Enhance `connector-google-workspace` with full mail ops
6. Register email tools in tool system
7. Wire into runtime ambient loop
8. Tests for all new code

## Verification

1. `pnpm build` — all packages compile
2. `pnpm test` — all tests pass (existing + new)
3. Manual: configure Microsoft account, verify email fetch
4. Manual: run email triage, verify priority scoring
5. Manual: generate smart reply, verify tone matching
