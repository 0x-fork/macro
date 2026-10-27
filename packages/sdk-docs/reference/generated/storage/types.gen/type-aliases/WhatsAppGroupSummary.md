# Type Alias: WhatsAppGroupSummary

> **WhatsAppGroupSummary** = \{ `backfill?`: `null` \| [`LinkedBackfill`](LinkedBackfill.md); `canSend`: `boolean`; `community?`: `null` \| [`LinkedCommunityReference`](LinkedCommunityReference.md); `id`: `string`; `kind`: [`LinkedChatKind`](LinkedChatKind.md); `lastMessageAt?`: `string` \| `null`; `name`: `string`; `sendReason?`: `null` \| [`LinkedReplyBlock`](LinkedReplyBlock.md); `unreadCount`: `number`; `userId`: `string`; \}

Adopted group visible through ordinary entity sharing.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-backfill"></a> `backfill?` | `null` \| [`LinkedBackfill`](LinkedBackfill.md) | - |
| <a id="property-cansend"></a> `canSend` | `boolean` | Caller may currently send from their own account. |
| <a id="property-community"></a> `community?` | `null` \| [`LinkedCommunityReference`](LinkedCommunityReference.md) | - |
| <a id="property-id"></a> `id` | `string` | Entity identifier. |
| <a id="property-kind"></a> `kind` | [`LinkedChatKind`](LinkedChatKind.md) | A group, or a direct chat with one person (only its owner sends). |
| <a id="property-lastmessageat"></a> `lastMessageAt?` | `string` \| `null` | Latest message timestamp. |
| <a id="property-name"></a> `name` | `string` | Display name: the group's, or a direct chat's other person. |
| <a id="property-sendreason"></a> `sendReason?` | `null` \| [`LinkedReplyBlock`](LinkedReplyBlock.md) | - |
| <a id="property-unreadcount"></a> `unreadCount` | `number` | Unread live messages for this viewer, counted up to [`UNREAD_COUNT_CAP`]. |
| <a id="property-userid"></a> `userId` | `string` | Actual entity owner. |
