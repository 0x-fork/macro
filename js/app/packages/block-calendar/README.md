# block-calendar

A Google-Calendar-style calendar surface, opened from the sidebar ("Calendar").

## Views

- **Week** (`w`) — 7-day time grid (default)
- **Day** (`d`) — single-day time grid
- **List** (`l`) — agenda of upcoming events grouped by day

## Keyboard shortcuts

Active while the calendar is focused:

| Key | Action            |
| --- | ----------------- |
| `j` | Next screen       |
| `k` | Previous screen   |
| `t` | Jump to today     |
| `n` | New event         |
| `w` | Week view         |
| `d` | Day view          |
| `l` | List view         |

`g d` (go-to leader) opens the calendar from anywhere.

## Events & invites

Events are persisted by the `calendar_service` backend
(`rust/cloud-storage/calendar`). Data access lives in `@queries/calendar`; the
wire client is `@service-calendar`.

Click an empty slot to create an event, or an event to edit it. Add guests by
email; **Save & send invites** records the invite on the backend and emails
attendees from the user's connected mailbox (via the email service), including
an `.ics` payload. The dialog can also download a standalone `.ics`.

## Layers

- `model/` — frontend domain types (instant-based, decoupled from the wire DTOs)
- `util/` — date math, iCalendar generation, invite-email composition
- `component/` — `Calendar` (orchestrator + hotkeys), `Toolbar`, `TimeGrid`
  (week/day), `ListView`, `EventDialog`, and the `CalendarContext` that wires
  state to queries/mutations.
