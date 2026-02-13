# Personality Editor Design

## Goal

Enhance Auxiora's personality system with richer identity fields (avatar, vibe, custom instructions) and a unified dashboard editor that exposes all personality controls in one place — replacing the current barebones name/pronouns form and template-only picker.

## Architecture

Extend the existing `packages/personality` system and dashboard settings pages. No new packages needed.

### Schema Changes (`packages/config`)

Add three fields to `AgentIdentitySchema`:

```typescript
avatar: z.string().optional(),           // URL, data URI, or workspace-relative path
vibe: z.string().max(200).optional(),    // Short freeform personality summary
customInstructions: z.string().max(4000).optional(), // Freeform markdown injected into system prompt
```

### Prompt Assembly Changes (`packages/personality`)

In `PromptAssembler.buildIdentityPreamble()`:
- Include `vibe` in the identity section: `"Vibe: {vibe}"`

In `PromptAssembler.buildBase()`:
- After loading SOUL.md, append `customInstructions` if present

### API Changes (`packages/dashboard` + `packages/runtime`)

Replace or update existing endpoints:

- `GET /api/personality` — Returns full personality state:
  - identity fields (name, pronouns, avatar, vibe)
  - tone settings (warmth, directness, humor, formality)
  - errorStyle, expertise, catchphrases, boundaries
  - SOUL.md raw content
  - customInstructions
  - active template ID (if any)

- `PUT /api/personality` — Accepts partial updates to any personality field. Writes to config and regenerates SOUL.md as needed.

- `POST /api/personality/preview` — Generates a sample greeting using the current personality config (calls the LLM with the assembled prompt + a test message).

### Dashboard UI (`packages/dashboard/ui`)

Replace `SettingsIdentity` and `SettingsPersonality` with a single `SettingsPersonalityEditor` page organized in sections:

**Section 1: Identity**
- Name (text input)
- Pronouns (select: she/her, he/him, they/them, it/its, custom)
- Avatar (file upload or URL input, with preview)
- Vibe (textarea, 200 char max, placeholder: "warm, witty, slightly sarcastic")

**Section 2: Tone**
- Four sliders (0-1): Warmth, Directness, Humor, Formality
- Labels at extremes (e.g. Warmth: "Reserved" ↔ "Warm")
- Visual indicator showing current personality "fingerprint"

**Section 3: Quick Start Templates**
- Template cards (existing 7 templates)
- Selecting a template populates all fields above
- Fields remain editable after template selection

**Section 4: Behavior**
- Error style (dropdown)
- Expertise areas (tag input)
- Catchphrases (key-value editor: greeting, farewell, thinking, success, error)
- Boundaries: neverJokeAbout, neverAdviseOn (tag inputs)

**Section 5: Custom Instructions**
- Large freeform textarea (markdown)
- Help text: "Additional instructions injected into the system prompt. Use this for personality quirks, communication rules, or domain-specific guidance."

**Section 6: Advanced — SOUL.md**
- Collapsible raw markdown editor
- Shows the generated SOUL.md content
- Editable for power users
- Warning: "Manual edits will be overwritten when you change fields above"

**Section 7: Preview**
- "Preview Personality" button
- Shows a generated sample response in a chat bubble
- Uses current personality settings to generate a greeting

### File Structure

```
packages/config/src/index.ts          — Add avatar, vibe, customInstructions to AgentIdentitySchema
packages/personality/src/modes/prompt-assembler.ts  — Inject vibe + customInstructions
packages/dashboard/ui/src/pages/settings/PersonalityEditor.tsx  — New unified page
packages/dashboard/ui/src/pages/settings/Identity.tsx     — Remove (merged into PersonalityEditor)
packages/dashboard/ui/src/pages/settings/Personality.tsx   — Remove (merged into PersonalityEditor)
packages/dashboard/src/router.ts      — Update routes
packages/runtime/src/index.ts         — Add/update API endpoints
```

## Tech Stack

- React + existing dashboard component patterns
- Zod schema validation (existing)
- Existing `PersonalityManager`, `PromptAssembler`, SOUL.md parser/builder
- CSS variables from existing theme system

## Testing

- Unit tests for schema changes (new fields validate correctly)
- Unit tests for prompt assembler (vibe + customInstructions appear in output)
- Manual testing of dashboard UI (sliders, template selection, preview)

## Non-Goals

- Voice profile editing (already separate system)
- Mode editor (modes are markdown files, editing them is separate)
- Marketplace personality sharing (already exists as separate system)
