# Type Alias: LinkedSendProgress

> **LinkedSendProgress** = \{ `createdAt`: `string`; `errorCode?`: `string` \| `null`; `groupId`: `string`; `id`: `string`; `messageId?`: `string` \| `null`; `payload`: [`LinkedSendReply`](LinkedSendReply.md); `state`: [`LinkedDeliveryState`](LinkedDeliveryState.md); `userId`: `string`; \}

Durable result of a deliberate send.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-createdat"></a> `createdAt` | `string` | Intent creation time. |
| <a id="property-errorcode"></a> `errorCode?` | `string` \| `null` | Sanitized failure code. |
| <a id="property-groupid"></a> `groupId` | `string` | Group entity. |
| <a id="property-id"></a> `id` | `string` | Stable intent id. |
| <a id="property-messageid"></a> `messageId?` | `string` \| `null` | Group message, once WhatsApp accepted it. |
| <a id="property-payload"></a> `payload` | [`LinkedSendReply`](LinkedSendReply.md) | The original request, so a failed draft can be recovered. |
| <a id="property-state"></a> `state` | [`LinkedDeliveryState`](LinkedDeliveryState.md) | Current state. |
| <a id="property-userid"></a> `userId` | `string` | Person who submitted it. |
