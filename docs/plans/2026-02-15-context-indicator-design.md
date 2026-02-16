# Context Indicator Component Design

## Summary

A React pill/badge component that displays The Architect's detected `TaskContext` — domain, emotional register — above or beside assistant responses in the chat UI.

## Location

`packages/dashboard/ui/src/components/ContextIndicator.tsx` (alongside existing components like `StatusBadge.tsx`).

## Architecture

Single-file functional component with static lookup maps. No new component library or icon library — uses emoji icons and extends the existing `.badge` CSS pattern in `global.css`.

## Props

```typescript
interface ContextIndicatorProps {
  context: TaskContext;
  onOverride: (domain: ContextDomain) => void;
  showOverrideMenu?: boolean;
  onToggleOverrideMenu?: () => void;
}
```

Types imported from `@auxiora/personality/architect`.

## Domain Display Map

17 domains mapped to: emoji icon, short label, CSS color class.

| Color Class | Domains |
|---|---|
| `context-red` | security_review, crisis_management |
| `context-blue` | code_engineering, architecture_design, debugging |
| `context-green` | team_leadership, one_on_one |
| `context-purple` | sales_pitch, marketing_content, negotiation |
| `context-orange` | strategic_planning, decision_making |
| `context-teal` | creative_work, writing_content |
| `context-gray` | learning_research, personal_development, general |

## Emotional Register Labels

Shown as secondary text after a `·` separator. `neutral` register shows nothing.

## Styling

- Global CSS extending `.badge` pattern
- Left border tint per domain category at ~8% opacity
- `var(--transition-base)` for smooth context changes
- Pill shape, muted colors, unobtrusive

## Testing

New test file using `@testing-library/react` + `vitest` + `jsdom`. Tests: render each domain, emotional register visibility, click handler, color classes.
