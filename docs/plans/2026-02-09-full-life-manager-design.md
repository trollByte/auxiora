# Full Life Manager Design

> **Status:** Implemented (Phase 1: `417f291`, Phases 2-5: `1da8ba2`)
> **Goal:** Make Auxiora a "can't live without" AI assistant that manages every aspect of a user's digital life — email, calendar, files, social media, notifications, and OS-level automation.

## Design Decisions

- **Email stack:** Both Google Workspace + Microsoft 365 (Graph API)
- **OS integration:** Full — file system, clipboard, notifications, app control, system state
- **Proactivity:** Always-on ambient AI with continuous sense-think-act loop
- **Social media:** Full read/post/reply across Twitter/X, LinkedIn, Reddit, Instagram
- **Offline:** Hybrid — core features work offline via local models, cloud for advanced tasks
- **Finance:** Not in scope for this design

---

## Architecture: The Ambient Loop

The core concept is a continuous **sense-think-act** cycle gated by the existing Autonomy Engine.

```
┌──────────────────────────────────────────────────────────┐
│                    THE AMBIENT LOOP                       │
│                                                          │
│   SENSE ────────► THINK ────────► ACT                   │
│                                                          │
│   EmailSync        Triage          Draft emails          │
│   CalSync          Classify        Send notifications    │
│   FileWatcher      Prioritize      Update calendar       │
│   Clipboard        Correlate       Move files            │
│   SocialPoll       Predict         Post social           │
│   SystemState      Brief           Run scripts           │
│                                                          │
│   Autonomy Engine gates every action through trust levels│
└──────────────────────────────────────────────────────────┘
```

### Autonomy Trust Levels (existing, applied to new features)

| Level | Behavior |
|-------|----------|
| 1 | Ask before every action |
| 2 | Ask for destructive/external actions, auto-handle read-only |
| 3 | Act first, notify after (user reviews in notification hub) |
| 4 | Silent operation with audit trail |
| 5 | Full autonomous — no confirmation needed |

---

## Packages Built

### 1. `@auxiora/connector-microsoft` (Phase 1)
Microsoft Graph API integration via `defineConnector()` pattern.

- **Auth:** OAuth2 with MSAL, incremental consent, refresh token rotation
- **Mail:** 7 actions — list, read, send, reply, forward, move, search
- **Calendar:** 5 actions — events CRUD, find availability, create event
- **OneDrive:** 4 actions — list, download, upload, search
- **Contacts:** 3 actions — list, get, search
- **Triggers:** 3 — new-email, calendar-event-reminder, file-shared
- **Entities:** 4 — mail-message, calendar-event, drive-item, contact
- **Files:** 5 TypeScript files, 31 tests

### 2. `@auxiora/email-intelligence` (Phase 1)
Turns raw messages into actionable intelligence.

- **Triage engine:** Score emails by priority (urgent/action/FYI/spam/newsletter) with configurable urgency keywords
- **Smart reply:** Generate tone-matched reply drafts with context awareness
- **Follow-up tracker:** Detect promises in sent emails, track response status with configurable deadlines
- **Thread summarizer:** Compress long email chains into key points + action items
- **Files:** 15 TypeScript files (src + tests), 23 tests

### 3. `@auxiora/calendar-intelligence` (Phase 1)
Smart calendar management and meeting preparation.

- **Schedule analyzer:** Day analysis with event count, meeting load hours, free slots, conflict detection, focus block identification
- **Schedule optimizer:** Suggest optimizations — move meetings, protect focus time, batch similar meetings
- **Meeting prep:** Pull attendee profiles, generate preparation briefs with talking points
- **Files:** 13 TypeScript files, 20 tests

### 4. `@auxiora/notification-hub` (Phase 1)
Unified notification center aggregating all sources.

- **Priority scoring:** 4 tiers — urgent (notify now), high (next batch), normal (digest), low (muted)
- **Batching:** Configurable batch intervals (default 30 min) with max batch size
- **DND/focus mode:** Suppress non-urgent during configured quiet hours
- **Digest generation:** Periodic grouped digests by source with summary
- **Delivery:** Multi-channel routing — desktop, channel, email (per notification)
- **Files:** 13 TypeScript files, 29 tests

### 5. `@auxiora/os-bridge` (Phase 2)
Deep OS integration for clipboard, files, apps, and system state.

- **ClipboardMonitor:** Watch clipboard changes, transform content (uppercase, lowercase, trim, JSON format), history with configurable max
- **FileWatcher:** Monitor directories for created/modified/deleted events, file classification (document, image, video, audio, code, archive, spreadsheet, presentation)
- **AppController:** Platform-specific commands for launch, focus, close — supports macOS (osascript), Linux (xdg-open, wmctrl, pkill), Windows (PowerShell, taskkill)
- **SystemStateMonitor:** Real-time platform, hostname, uptime, memory usage, CPU info, load averages
- **Files:** 16 TypeScript files, 41 tests

### 6. `@auxiora/connector-social` (Phase 3)
Social media connectors using `defineConnector()` pattern.

- **Twitter/X:** OAuth2 — timeline read, mentions list, post tweet, reply, DM send, DM read, search tweets, delete tweet
- **LinkedIn:** OAuth2 — feed read, notifications list, create post, comment, messaging send/read, connections list, share article
- **Reddit:** OAuth2 — subreddit read, inbox read, submit post, comment, vote, save post, user profile, search
- **Instagram:** OAuth2 — feed read, stories read, DM send/read, media upload, user search, comment
- **Each connector:** Full action set with trust levels, side effect flags, and typed parameters
- **Files:** 14 TypeScript files, 48 tests

### 7. `@auxiora/contacts` (Phase 3)
Unified contact graph from all sources.

- **ContactGraph:** Add, search, find by email/name, list all, update, remove contacts
- **RelationshipScorer:** Frequency/recency/context-weighted strength scoring with configurable decay (default 90 days)
- **ContactDeduplicator:** Similarity scoring across name, email, company; auto-merge above threshold (default 0.8)
- **ContextRecall:** "Who is X?" with relationship summary, `getUpcomingBirthdays()` within configurable window
- **Files:** 16 TypeScript files, 29 tests

### 8. `@auxiora/research` (Phase 4)
Multi-source research engine with credibility evaluation.

- **ResearchEngine:** Configurable depth (quick/standard/deep), parallel source gathering, finding deduplication, executive summary synthesis
- **CredibilityScorer:** Domain reputation map, bonus scoring for HTTPS/author/date/cross-reference
- **CitationTracker:** Source and finding management, format citations as inline, footnote, or bibliography
- **KnowledgeGraph:** Entity-relation graph with typed entities, bidirectional relations, related entity queries
- **Files:** 16 TypeScript files, 27 tests (engine: 8, credibility: 8, citation: 8, knowledge-graph: 6, but some overlap — actual 30 per agent report)

### 9. `@auxiora/compose` (Phase 5)
Context-aware writing assistant.

- **ComposeEngine:** Platform-adaptive tone (formal for email, casual for Slack, brief for Twitter), character limit enforcement (280 for Twitter), sign-offs for email/LinkedIn
- **TemplateEngine:** 6 built-in templates (meeting request, follow-up, introduction, status update, thank you, apology) with variable rendering
- **GrammarChecker:** 6 checks — double spaces, repeated words, long sentences (>40 words), passive voice, weasel words, missing punctuation
- **LanguageDetector:** 5 languages (English, Spanish, French, German, Portuguese) via word frequency, RTL detection (Arabic, Hebrew, Persian, Urdu)
- **Files:** 16 TypeScript files, 32 tests

---

## AI Tools Registered

### Email & Calendar Tools (Phase 1)

| Tool Name | Permission | Description |
|-----------|-----------|-------------|
| `email_triage` | AUTO_APPROVE | Prioritized email summary with triage categories |
| `email_reply` | AUTO/APPROVAL | Draft (auto) or send (approval) email reply |
| `email_search` | AUTO_APPROVE | Search across all connected email accounts |
| `email_compose` | AUTO/APPROVAL | Draft (auto) or send (approval) new email |
| `summarize_thread` | AUTO_APPROVE | Summarize email thread into key points |
| `calendar_optimize` | AUTO_APPROVE | Analyze schedule, find focus blocks, detect conflicts |
| `schedule_meeting` | USER_APPROVAL | Find availability and create meeting |
| `meeting_prep` | AUTO_APPROVE | Generate meeting preparation brief |

### OS Bridge Tools (Phase 2)

| Tool Name | Permission | Description |
|-----------|-----------|-------------|
| `clipboard_transform` | AUTO_APPROVE | Read and transform clipboard content |
| `app_launch` | AUTO/APPROVAL | Launch/focus (auto) or close (approval) apps |
| `system_info` | AUTO_APPROVE | CPU, memory, uptime, platform info |

### Social & Contacts Tools (Phase 3)

| Tool Name | Permission | Description |
|-----------|-----------|-------------|
| `post_social` | USER_APPROVAL | Post to Twitter/LinkedIn/Reddit |
| `check_mentions` | AUTO_APPROVE | Check mentions across social platforms |
| `schedule_post` | USER_APPROVAL | Schedule future social media post |
| `who_is` | AUTO_APPROVE | Contact lookup with relationship context |
| `contact_search` | AUTO_APPROVE | Search contacts by name/email/company |

### Research Tool (Phase 4)

| Tool Name | Permission | Description |
|-----------|-----------|-------------|
| `research` | AUTO_APPROVE | Multi-source research with credibility scoring |

### Compose Tools (Phase 5)

| Tool Name | Permission | Description |
|-----------|-----------|-------------|
| `compose` | AUTO_APPROVE | Platform-aware text composition |
| `grammar_check` | AUTO_APPROVE | Grammar, spelling, style analysis |
| `detect_language` | AUTO_APPROVE | Language detection with RTL support |

**Total: 20 new tools** (8 email/calendar + 3 OS + 5 social/contacts + 1 research + 3 compose)

---

## Tool Permission Model

Tools use a dependency-injection pattern with `set*()` functions wired at runtime. The `getPermission(params)` method enables context-sensitive permissions:

- **Read-only tools** always return `AUTO_APPROVE` (email_triage, check_mentions, system_info, etc.)
- **Write tools with draft mode** return `AUTO_APPROVE` for drafts, `USER_APPROVAL` for sends (email_reply, email_compose)
- **Destructive/public tools** always return `USER_APPROVAL` (post_social, schedule_meeting, app_launch close)
- **Missing dependencies** return graceful "not configured" messages with setup instructions

---

## Key Data Flows

### Email Triage (every 2 minutes)
```
Connector.listNewEmails()
  → EmailIntelligence.triage(emails)
  → For each email:
      URGENT  → NotificationHub.send(urgent, summary)
      ACTION  → Queue draft reply + notification
      FYI     → Batch into 30-min digest
      SPAM    → Auto-archive (trust level >= 3)
```

### Meeting Prep (15 min before each meeting)
```
CalendarIntelligence.getUpcoming(15min)
  → ContactGraph.getProfiles(attendees)
  → EmailIntelligence.getThreadsWith(attendees)
  → Research.summarize(meetingTopic)
  → Briefing.generateMeetingBrief()
  → NotificationHub.send(important, brief)
```

### File Organization (on file creation event)
```
OsBridge.onFileCreated(~/Downloads)
  → AI classifies file type
  → Suggest destination folder
  → trust >= 3: auto-move + notify
  → trust <  3: ask user first
```

### Morning Briefing (scheduled daily)
```
Briefing.generateMorning() pulls:
  → CalendarIntelligence.todaySchedule()
  → EmailIntelligence.overnightSummary()
  → Social.overnightMentions()
  → Behaviors.pendingReminders()
  → Weather API + News RSS
  → NotificationHub.send(briefing)
```

---

## Runtime Wiring

```typescript
// In AuxioraRuntime.initialize()
this.emailIntel = new EmailIntelligence(this.connectors);
this.calendarIntel = new CalendarIntelligence(this.connectors);
this.contactGraph = new ContactGraph(this.connectors, this.sessions);
this.notificationHub = new NotificationHub(this.channels, this.gateway);
this.osBridge = new OsBridge(platform);
this.briefingEngine = new BriefingEngine(this.emailIntel, this.calendarIntel, ...);
this.researchAgent = new ResearchAgent(this.browser, this.orchestrator);
this.composeEngine = new ComposeEngine(this.providers, this.personality);

// Ambient scheduler
this.ambientScheduler = new AmbientScheduler({
  emailCheck:     '*/2 * * * *',    // every 2 min
  calendarCheck:  '*/5 * * * *',    // every 5 min
  socialCheck:    '*/15 * * * *',   // every 15 min
  morningBrief:   '0 7 * * *',     // 7am daily
  eveningSummary: '0 18 * * *',    // 6pm daily
  fileOrganize:   'on-event',
  clipboardWatch: 'on-event',
});

// Tool dependency injection
setEmailIntelligence(this.emailIntel);
setEmailConnectors(this.connectors);
setCalendarIntelligence(this.calendarIntel);
setCalendarConnectors(this.connectors);
setClipboardMonitor(this.osBridge.clipboard);
setAppController(this.osBridge.appController);
setSystemStateMonitor(this.osBridge.systemState);
setSocialConnectors(this.socialConnectors);
setContactGraph(this.contactGraph);
setContextRecall(this.contextRecall);
setResearchEngine(this.researchAgent);
setComposeEngine(this.composeEngine);
setGrammarChecker(this.grammarChecker);
setLanguageDetector(this.languageDetector);
```

---

## Implementation Summary

### Phase 1: Email Intelligence + Microsoft 365 (`417f291`)
4 packages, 46 files, 103 tests. Delivered email triage, smart reply, follow-up tracking, Microsoft mail/calendar/drive/contacts connector, calendar analysis and meeting prep, unified notification hub.

### Phase 2: OS Bridge (`1da8ba2`)
1 package, 16 files, 41 tests. Delivered clipboard monitor with transforms, file watcher with classification, cross-platform app controller, system state monitoring.

### Phase 3: Social Media + Contact Graph (`1da8ba2`)
2 packages, 30 files, 77 tests. Delivered full CRUD connectors for 4 social platforms, unified contact graph with relationship scoring and deduplication.

### Phase 4: Research Engine (`1da8ba2`)
1 package, 16 files, 27 tests. Delivered multi-source research with configurable depth, credibility scoring, citation tracking, knowledge graph.

### Phase 5: Compose Engine (`1da8ba2`)
1 package + tool integration, 16 files, 32 tests. Delivered context-aware composition, template library, grammar checking, language detection.

### Tool Layer (across all phases)
5 tool files + index registration, 5 test files. 20 new AI tools with 72 tests.

**Totals:** 9 new packages, 124 new TypeScript files, 20 new AI tools, 2167 total tests across 174 test files (all passing).

---

## Future Work (Not Yet Implemented)

- **Ambient briefing engine:** Morning/evening/pre-meeting briefs (data flows designed, not yet wired)
- **Ambient scheduler:** Cron-based polling loop for email/calendar/social checks
- **Runtime wiring:** `set*()` calls from runtime `initialize()` to connect tools to backing services
- **Local/offline fallback:** Local LLM integration for offline capability
- **Weather + News:** External API integrations for morning briefing
- **Unsubscribe detector:** Auto-detect marketing emails for batch cleanup
- **Travel time buffers:** Insert travel time between in-person calendar events
