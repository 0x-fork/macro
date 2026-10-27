# Type Alias: LinkedSendReply

> **LinkedSendReply** = \{ `idempotencyKey`: `string`; `message`: [`LinkedReplyContent`](LinkedReplyContent.md); `replyTo?`: `string` \| `null`; \}

Explicit send action from a person. Only deliberate sends reach WhatsApp.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-idempotencykey"></a> `idempotencyKey` | `string` | Stable client intent key. A changed payload with this key is a conflict. |
| <a id="property-message"></a> `message` | [`LinkedReplyContent`](LinkedReplyContent.md) | Content. |
| <a id="property-replyto"></a> `replyTo?` | `string` \| `null` | Group message being quoted, within this group. |
