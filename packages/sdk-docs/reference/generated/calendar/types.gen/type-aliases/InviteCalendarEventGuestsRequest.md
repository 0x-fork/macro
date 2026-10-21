# Type Alias: InviteCalendarEventGuestsRequest

> **InviteCalendarEventGuestsRequest** = \{ `calendarId?`: `string` \| `null`; `guests`: [`CalendarGuestInputBody`](CalendarGuestInputBody.md)[]; `recurrenceId?`: `string` \| `null`; `scope?`: `null` \| [`CalendarUpdateScopeParam`](CalendarUpdateScopeParam.md); \}

Request body adding guests to an event without touching anyone already
invited.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-calendarid"></a> `calendarId?` | `string` \| `null` | Calendar whose copy of the event is written, for an event synced from more than one calendar. Omit to write the canonical copy. |
| <a id="property-guests"></a> `guests` | [`CalendarGuestInputBody`](CalendarGuestInputBody.md)[] | Guests to add; anyone already on the event is skipped. |
| <a id="property-recurrenceid"></a> `recurrenceId?` | `string` \| `null` | Original-start key of the occurrence the guests are added to. |
| <a id="property-scope"></a> `scope?` | `null` \| [`CalendarUpdateScopeParam`](CalendarUpdateScopeParam.md) | - |
