# Type Alias: WhatsAppParticipant

> **WhatsAppParticipant** = \{ `admin`: `boolean`; `alternateJid?`: `string` \| `null`; `displayName?`: `string` \| `null`; `jid`: `string`; \}

Someone in a WhatsApp chat; Macro access is a separate grant.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-admin"></a> `admin` | `boolean` | Group admin. |
| <a id="property-alternatejid"></a> `alternateJid?` | `string` \| `null` | The other address WhatsApp verified for them. |
| <a id="property-displayname"></a> `displayName?` | `string` \| `null` | Their WhatsApp name, untrusted. |
| <a id="property-jid"></a> `jid` | `string` | Phone-number or LID JID. |
