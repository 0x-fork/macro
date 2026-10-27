# Type Alias: WhatsAppGroupDetail

> **WhatsAppGroupDetail** = [`WhatsAppGroupSummary`](WhatsAppGroupSummary.md) & \{ `accessLevel`: [`AccessLevel`](AccessLevel.md); `disappearingSeconds?`: `number` \| `null`; `limits`: [`LinkedCapabilities`](LinkedCapabilities.md); `roster?`: `null` \| [`WhatsAppRoster`](WhatsAppRoster.md); `sendingIdentity?`: `string` \| `null`; `sharePermission`: [`SharePermissionV2`](SharePermissionV2.md); \}

Full group detail and current viewer capabilities.

## Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `accessLevel` | [`AccessLevel`](AccessLevel.md) | Caller's effective permission. |
| `disappearingSeconds?` | `number` \| `null` | WhatsApp's disappearing-messages timer in seconds while it is on; Macro keeps the messages anyway. `null` when off or unknown. |
| `limits` | [`LinkedCapabilities`](LinkedCapabilities.md) | Size and mutation limits. |
| `roster?` | `null` \| [`WhatsAppRoster`](WhatsAppRoster.md) | - |
| `sendingIdentity?` | `string` \| `null` | Caller's own phone identity, never another account's identity. |
| `sharePermission` | [`SharePermissionV2`](SharePermissionV2.md) | Owner-controlled standard sharing configuration. |
