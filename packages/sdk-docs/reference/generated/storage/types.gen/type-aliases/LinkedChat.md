# Type Alias: LinkedChat

> **LinkedChat** = \{ `archived`: `boolean`; `canAdd`: `boolean`; `cannotAddReason?`: `null` \| [`LinkedCannotAdd`](LinkedCannotAdd.md); `community?`: `null` \| [`LinkedCommunityReference`](LinkedCommunityReference.md); `group?`: `null` \| [`LinkedGroupReference`](LinkedGroupReference.md); `jid`: `string`; `kind`: [`LinkedChatKind`](LinkedChatKind.md); `lastActivityAt?`: `string` \| `null`; `name`: `string`; `pinned`: `boolean`; `shared?`: `null` \| [`LinkedSharedGroupReference`](LinkedSharedGroupReference.md); \}

One chat of the caller's WhatsApp chat list, as WhatsApp Web lists it.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-archived"></a> `archived` | `boolean` | Archived in WhatsApp. |
| <a id="property-canadd"></a> `canAdd` | `boolean` | "Add to Macro" works now. |
| <a id="property-cannotaddreason"></a> `cannotAddReason?` | `null` \| [`LinkedCannotAdd`](LinkedCannotAdd.md) | - |
| <a id="property-community"></a> `community?` | `null` \| [`LinkedCommunityReference`](LinkedCommunityReference.md) | - |
| <a id="property-group"></a> `group?` | `null` \| [`LinkedGroupReference`](LinkedGroupReference.md) | - |
| <a id="property-jid"></a> `jid` | `string` | WhatsApp chat JID: a group, or the other person's phone-number JID (LID when WhatsApp never told us the number). |
| <a id="property-kind"></a> `kind` | [`LinkedChatKind`](LinkedChatKind.md) | Group or direct chat. |
| <a id="property-lastactivityat"></a> `lastActivityAt?` | `string` \| `null` | Newest activity WhatsApp reported (message or history sync); `null` when unknown. The list is sorted by it, newest first, unknown last. |
| <a id="property-name"></a> `name` | `string` | Group: the subject, or member names for an unnamed group. Direct: the contact or WhatsApp name, else `+<phone>`. Always non-empty. |
| <a id="property-pinned"></a> `pinned` | `boolean` | Pinned in WhatsApp. |
| <a id="property-shared"></a> `shared?` | `null` \| [`LinkedSharedGroupReference`](LinkedSharedGroupReference.md) | - |
