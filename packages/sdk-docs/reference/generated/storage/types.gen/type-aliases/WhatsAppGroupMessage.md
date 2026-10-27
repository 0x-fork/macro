# Type Alias: WhatsAppGroupMessage

> **WhatsAppGroupMessage** = \{ `attachments`: [`LinkedAttachment`](LinkedAttachment.md)[]; `body`: `string`; `deleted`: `boolean`; `deliveryState?`: `null` \| [`LinkedDeliveryState`](LinkedDeliveryState.md); `editedAt?`: `string` \| `null`; `forwarded`: `boolean`; `id`: `string`; `kind`: [`WhatsAppMessageKind`](WhatsAppMessageKind.md); `mentions`: [`WhatsAppMention`](WhatsAppMention.md)[]; `reactions`: [`WhatsAppGroupReaction`](WhatsAppGroupReaction.md)[]; `receivedAt`: `string`; `replyTo?`: `string` \| `null`; `rich?`: `null` \| [`WhatsAppRichContent`](WhatsAppRichContent.md); `sender`: [`WhatsAppGroupSender`](WhatsAppGroupSender.md); `sentAt`: `string`; `viewOnce`: `boolean`; \}

One message in an adopted group.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-attachments"></a> `attachments` | [`LinkedAttachment`](LinkedAttachment.md)[] | Imported or pending attachments. |
| <a id="property-body"></a> `body` | `string` | Plain WhatsApp text. |
| <a id="property-deleted"></a> `deleted` | `boolean` | Deleted for everyone. |
| <a id="property-deliverystate"></a> `deliveryState?` | `null` \| [`LinkedDeliveryState`](LinkedDeliveryState.md) | - |
| <a id="property-editedat"></a> `editedAt?` | `string` \| `null` | Last edit timestamp. |
| <a id="property-forwarded"></a> `forwarded` | `boolean` | Forwarded from another chat. |
| <a id="property-id"></a> `id` | `string` | Stable message id. |
| <a id="property-kind"></a> `kind` | [`WhatsAppMessageKind`](WhatsAppMessageKind.md) | A message, or a system line. |
| <a id="property-mentions"></a> `mentions` | [`WhatsAppMention`](WhatsAppMention.md)[] | People the body @-mentions. |
| <a id="property-reactions"></a> `reactions` | [`WhatsAppGroupReaction`](WhatsAppGroupReaction.md)[] | Reactions grouped by emoji. |
| <a id="property-receivedat"></a> `receivedAt` | `string` | Timestamp first received by Macro. |
| <a id="property-replyto"></a> `replyTo?` | `string` \| `null` | Message quoted by this one. |
| <a id="property-rich"></a> `rich?` | `null` \| [`WhatsAppRichContent`](WhatsAppRichContent.md) | - |
| <a id="property-sender"></a> `sender` | [`WhatsAppGroupSender`](WhatsAppGroupSender.md) | Sender. |
| <a id="property-sentat"></a> `sentAt` | `string` | Timestamp assigned by WhatsApp. |
| <a id="property-viewonce"></a> `viewOnce` | `boolean` | Sent as view-once in WhatsApp; Macro shows it like any media. |
