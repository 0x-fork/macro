# Type Alias: WhatsAppRoster

> **WhatsAppRoster** = \{ `announce`: `boolean`; `name`: `string`; `observedAt`: `string`; `participants`: [`WhatsAppParticipant`](WhatsAppParticipant.md)[]; \}

A chat's WhatsApp metadata as the caller's account last read it.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-announce"></a> `announce` | `boolean` | Only admins may post. |
| <a id="property-name"></a> `name` | `string` | WhatsApp subject. |
| <a id="property-observedat"></a> `observedAt` | `string` | When this was read from WhatsApp. |
| <a id="property-participants"></a> `participants` | [`WhatsAppParticipant`](WhatsAppParticipant.md)[] | Everyone in the chat. |
