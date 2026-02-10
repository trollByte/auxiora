# Notification Intelligence Vertical Slice Design

> **Date:** 2026-02-10
> **Status:** Draft
> **Goal:** Make Auxiora proactively notify users about important events in real-time — urgent emails, upcoming meetings, PR review requests — through webchat and connected channels.

## The Problem

Auxiora can generate morning briefings, but between briefings it's silent. Important events (urgent email, meeting in 15 min, someone mentioned you) go unnoticed until the user checks. The notification-hub, pattern engine, and trigger manager exist but aren't wired into a real-time delivery pipeline.

## Design

### Phase A: NotificationOrchestrator (new file in ambient package)

Central coordination class that connects trigger events to notification delivery.

**File:** `packages/ambient/src/orchestrator.ts`

```typescript
class NotificationOrchestrator {
  constructor(deps: {
    notificationHub: NotificationHub;
    dndManager: DoNotDisturbManager;
    deliveryChannel: (message: string) => Promise<void>;
  })

  // Process raw trigger events into notifications
  processTriggerEvents(events: TriggerEvent[]): void

  // Process a timed check (e.g., calendar upcoming)
  processCalendarCheck(events: Array<{ title: string; startTime: number }>): void

  // Get pending notifications for a user
  getPending(): Notification[]

  // Dismiss a notification
  dismiss(id: string): boolean
}
```

**Event-to-notification mapping:**
- `new-email` trigger → check subject for urgency keywords → `urgent` or `important` priority
- `event-starting-soon` trigger → always `important` priority
- `file-shared` trigger → `low` priority
- Webhook events (GitHub PR) → `important` priority

**Delivery:** Formats notification as a short message and calls `deliveryChannel` (same pattern as ambient scheduler — broadcasts to webchat + channels).

### Phase B: Real-Time Event Loop (ambient scheduler extension)

**File:** `packages/ambient/src/scheduler.ts` (extend existing)

Add a new cron job to AmbientScheduler:
- `notificationPoll` — runs every 60 seconds
- Calls `triggerManager.pollAll()` to collect events from all connectors
- Feeds events to `NotificationOrchestrator.processTriggerEvents()`
- Also checks calendar for events starting within 15 minutes

Add to `AmbientSchedulerConfig`:
- `notificationPollCron: string` (default: `'*/1 * * * *'` — every minute)
- `calendarAlertMinutes: number` (default: 15)

### Phase C: Dashboard notification preferences

**File:** `packages/dashboard/src/router.ts` (extend)

Add routes:
- `GET /notifications` — list recent notifications (from notification hub)
- `POST /notifications/:id/dismiss` — dismiss a notification
- `GET /notifications/preferences` — get notification preferences from vault
- `POST /notifications/preferences` — save preferences (DND schedule, urgency keywords, etc.)

**File:** `packages/dashboard/ui/src/pages/SettingsNotifications.tsx` (new)

Settings page with:
- DND schedule (weekday hours, weekend toggle)
- Urgency keywords (comma-separated list)
- Per-source enable/disable toggles (email, calendar, github)
- Notification sound toggle

**File:** `packages/dashboard/ui/src/api.ts` (extend)

Add API methods for notification endpoints.

### Phase D: Runtime wiring

**File:** `packages/runtime/src/index.ts`

Wire NotificationOrchestrator into initialize():
- Create NotificationHub + DoNotDisturbManager
- Create NotificationOrchestrator with delivery channel
- Pass orchestrator to AmbientScheduler (new dep)
- Subscribe to trigger events → feed to orchestrator

### Phase E: Tests

- `packages/ambient/tests/orchestrator.test.ts` — orchestrator event processing, urgency detection, DND filtering
- `packages/ambient/tests/scheduler.test.ts` — extend with notification poll job tests

## Files Modified/Created

1. `packages/ambient/src/orchestrator.ts` — NEW: NotificationOrchestrator
2. `packages/ambient/src/scheduler.ts` — extend with notification poll job
3. `packages/ambient/src/index.ts` — re-export orchestrator
4. `packages/ambient/tests/orchestrator.test.ts` — NEW: orchestrator tests
5. `packages/ambient/tests/scheduler.test.ts` — extend scheduler tests
6. `packages/dashboard/src/router.ts` — notification routes
7. `packages/dashboard/ui/src/pages/SettingsNotifications.tsx` — NEW: notification settings UI
8. `packages/dashboard/ui/src/App.tsx` — add notification settings route
9. `packages/dashboard/ui/src/api.ts` — notification API methods
10. `packages/dashboard/ui/src/components/Layout.tsx` — add Notifications nav link
11. `packages/runtime/src/index.ts` — wire orchestrator into runtime

## Verification

1. `pnpm build` — compiles
2. `pnpm test` — all tests pass
3. Manual: connect Google Workspace, receive a test email, see notification appear in webchat
