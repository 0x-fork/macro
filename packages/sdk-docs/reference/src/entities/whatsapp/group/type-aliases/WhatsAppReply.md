# Type Alias: WhatsAppReply

> **WhatsAppReply** = \{ `mentions?`: [`WhatsAppParticipant`](../../participant/classes/WhatsAppParticipant.md)[]; `text`: `string`; `type`: `"text"`; \} \| \{ `caption?`: `string`; `type`: `"media"`; `upload`: [`WhatsAppUpload`](../../upload/classes/WhatsAppUpload.md); \} \| \{ `message`: [`WhatsAppMessage`](../../message/classes/WhatsAppMessage.md); `operation`: `"reaction"` \| `"edit"` \| `"delete"`; `text?`: `string`; `type`: `"mutation"`; \}

Deliberate content from the credential owner's own WhatsApp account.

## Union Members

### Type Literal

\{ `mentions?`: [`WhatsAppParticipant`](../../participant/classes/WhatsAppParticipant.md)[]; `text`: `string`; `type`: `"text"`; \}

| Name | Type | Description |
| ------ | ------ | ------ |
| `mentions?` | [`WhatsAppParticipant`](../../participant/classes/WhatsAppParticipant.md)[] | Participants mentioned (from `participants()`); the text names each as `@<mentionToken>`. |
| `text` | `string` | - |
| `type` | `"text"` | - |

***

### Type Literal

\{ `caption?`: `string`; `type`: `"media"`; `upload`: [`WhatsAppUpload`](../../upload/classes/WhatsAppUpload.md); \}

***

### Type Literal

\{ `message`: [`WhatsAppMessage`](../../message/classes/WhatsAppMessage.md); `operation`: `"reaction"` \| `"edit"` \| `"delete"`; `text?`: `string`; `type`: `"mutation"`; \}
