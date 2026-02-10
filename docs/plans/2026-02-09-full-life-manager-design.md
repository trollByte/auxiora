# Full Life Manager Design

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

## New Packages

### 1. `@auxiora/connector-microsoft`
Microsoft Graph API integration.

- **Auth:** OAuth2 with MSAL, incremental consent, refresh token rotation
- **Mail:** List, read, send, reply, forward, move, archive, flag, search
- **Calendar:** Events CRUD, availability, attendees, recurring, reminders
- **OneDrive:** File list, download, upload, search, sharing
- **Contacts:** People API, contact groups, photos
- **Delta sync:** Only fetch changes since last check (Microsoft Graph delta links)

### 2. `@auxiora/email-intelligence`
The email brain — turns raw messages into actionable intelligence.

- **Triage engine:** Score emails by priority (urgent/action/FYI/spam/newsletter)
- **Auto-categorization:** ML-based classification using LLM judgment
- **Smart reply:** Generate tone-matched reply drafts
- **Follow-up tracker:** Detect promises in sent emails ("I'll send you..."), create reminders
- **Thread summarizer:** Compress long email chains into digestible summaries
- **Unsubscribe detector:** Identify marketing emails, offer batch cleanup

### 3. `@auxiora/calendar-intelligence`
Smart calendar management.

- **Meeting prep:** Pull attendee profiles, past interactions, agenda docs, generate brief
- **Schedule optimizer:** Identify optimal times for focus work, meetings, breaks
- **Conflict resolver:** Detect double-bookings, suggest alternatives
- **Travel time:** Insert travel buffers between in-person meetings
- **Availability negotiator:** Multi-party scheduling across calendars

### 4. `@auxiora/notification-hub`
Unified notification center aggregating all sources.

- **Aggregation:** Email, calendar, channels, social, system, behaviors — one stream
- **Priority scoring:** Urgent (notify now), important (next batch), low (daily digest), muted
- **Batching:** Group low-priority items into periodic digests (every 30 min or configurable)
- **DND/focus mode:** Suppress non-urgent during deep work calendar blocks
- **Routing:** Desktop toast, mobile push, channel message, email digest — per-source configurable

### 5. `@auxiora/os-bridge`
Deep OS integration for clipboard, files, apps, and system state.

- **Clipboard monitor:** Watch system clipboard changes, offer smart transforms
- **File watcher:** Monitor configurable directories (Downloads, Desktop, Documents)
- **App controller:** Open, close, focus, switch apps; run platform automation scripts
- **System state:** Battery, network, disk, processes, display, audio
- **Platform backends:**
  - macOS: AppleScript + osascript, Shortcuts, Accessibility API
  - Linux: xdotool, wmctrl, xclip/xsel, D-Bus
  - Windows: PowerShell, COM automation, Win32 API via ffi

### 6. `@auxiora/connector-social`
Social media read/write/schedule across platforms.

- **Twitter/X:** API v2 — timeline, mentions, post, reply, DMs, lists, search
- **LinkedIn:** Profile, feed, post, articles, connections, messaging
- **Reddit:** Subreddits, posts, comments, DMs, saved items
- **Instagram:** Feed, stories (read), DMs, post scheduling
- **Unified interface:** `read()`, `post()`, `reply()`, `schedule()`, `search()` across all
- **Rate limiting:** Per-platform rate limit management with queue/retry
- **Draft queue:** Compose, review, approve workflow before posting

### 7. `@auxiora/contacts`
Unified contact graph from all sources.

- **Merge:** Deduplicate contacts across email, calendar, social, channels
- **Relationship scoring:** Frequency, recency, context-weighted strength
- **Context recall:** "Last time you talked to X, you discussed Y on Z date"
- **Life events:** Birthday/anniversary reminders from social + calendar data
- **Org chart inference:** Detect organizational relationships from email patterns

### 8. `@auxiora/research`
Deep multi-source research agent.

- **Multi-tab research:** Parallel browser sessions gathering evidence
- **Citation tracking:** Source URL, timestamp, relevance score
- **Source credibility:** Domain reputation, cross-reference verification
- **Structured output:** Executive summary + detailed findings + sources + confidence
- **Knowledge graph:** Build persistent knowledge from research sessions into memory

### 9. `@auxiora/compose`
Context-aware writing assistant.

- **Platform adaptation:** Formal for email, professional for LinkedIn, casual for Slack
- **Tone matching:** Analyze recipient's writing style, mirror appropriately
- **Template library:** Smart templates with variable fill (proposals, follow-ups, intros)
- **Grammar/style:** Checking aligned with SOUL.md personality
- **Multi-language:** Auto-detect language, translate, compose in target language

### 10. Enhanced `@auxiora/ambient`
Upgrade existing stubs to full briefing engine.

- **Morning brief:** Weather, calendar preview, email summary, priority tasks, news
- **Pre-meeting brief:** Attendee profiles, context, agenda, past interactions
- **End-of-day summary:** Accomplishments, pending items, tomorrow preview
- **Configurable:** User sets schedule, content sections, delivery channel

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
```

---

## Implementation Phases

### Phase 1: Email Intelligence + Microsoft 365
~30 files. Delivers: email triage, smart reply, follow-up tracking, Microsoft mail/calendar.

### Phase 2: Calendar Intelligence + Notification Hub
~21 files. Delivers: meeting prep briefs, schedule optimization, unified smart notifications.

### Phase 3: OS Bridge + File Intelligence
~23 files. Delivers: clipboard assist, auto-file-organize, app control, system awareness.

### Phase 4: Social Media + Contact Graph
~24 files. Delivers: post/read across platforms, unified contacts, relationship intelligence.

### Phase 5: Research + Compose + Local Fallback
~16 files. Delivers: deep research agent, writing assist, offline capability.

**Total:** ~130 new files, ~20 new tools, 10 new/enhanced packages.

---

## New Tools Registered

| Tool | Phase | Description |
|------|-------|-------------|
| `email-triage` | 1 | Show prioritized email summary |
| `email-reply` | 1 | Draft and send email reply |
| `email-search` | 1 | Search across email accounts |
| `email-compose` | 1 | Compose new email |
| `calendar-optimize` | 2 | Optimize schedule for focus time |
| `schedule-meeting` | 2 | Find time and create meeting |
| `meeting-prep` | 2 | Generate meeting preparation brief |
| `notify` | 2 | Send notification through hub |
| `file-organize` | 3 | Categorize and move files |
| `clipboard-transform` | 3 | Transform clipboard content |
| `app-launch` | 3 | Open/control applications |
| `system-info` | 3 | Get system state information |
| `post-social` | 4 | Post to social media platform |
| `check-mentions` | 4 | Check social media mentions |
| `schedule-post` | 4 | Schedule future social post |
| `who-is` | 4 | Look up contact with context |
| `research` | 5 | Run deep multi-source research |
| `compose` | 5 | Context-aware writing assist |
| `translate` | 5 | Translate with context awareness |
| `summarize-thread` | 1 | Summarize email thread |
