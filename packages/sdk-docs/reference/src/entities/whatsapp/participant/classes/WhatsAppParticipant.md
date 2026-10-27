# Class: WhatsAppParticipant

Someone in an added WhatsApp chat, from its roster; mention them in a text reply.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-group"></a> `group` | `readonly` | [`WhatsAppGroup`](../../group/classes/WhatsAppGroup.md) | The chat whose roster lists them. |
| <a id="property-id"></a> `id` | `readonly` | `string` | Their WhatsApp id: correlation data, not a Macro user. |

## Accessors

### admin

#### Get Signature

> **get** **admin**(): `boolean` \| `undefined`

Whether they administer the group, when read from the roster.

##### Returns

`boolean` \| `undefined`

***

### displayName

#### Get Signature

> **get** **displayName**(): `string` \| `undefined`

Their WhatsApp name, untrusted, when the roster had one.

##### Returns

`string` \| `undefined`

***

### mentionToken

#### Get Signature

> **get** **mentionToken**(): `string`

The digits a text reply writes as `@<digits>` to mention them.

##### Returns

`string`

## Methods

### toJSON()

> **toJSON**(): \{ `admin`: `boolean` \| `undefined`; `displayName`: `string` \| `undefined`; `group`: `string`; `id`: `string`; \}

Serialize the participant reference without credentials.

#### Returns

\{ `admin`: `boolean` \| `undefined`; `displayName`: `string` \| `undefined`; `group`: `string`; `id`: `string`; \}

| Name | Type |
| ------ | ------ |
| `admin` | `boolean` \| `undefined` |
| `displayName` | `string` \| `undefined` |
| `group` | `string` |
| `id` | `string` |

***

### byId()

> `static` **byId**(`group`, `id`): `WhatsAppParticipant`

Reference a participant of a chat by WhatsApp id.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `group` | [`WhatsAppGroup`](../../group/classes/WhatsAppGroup.md) |
| `id` | `string` |

#### Returns

`WhatsAppParticipant`

***

### from()

> `static` **from**(`group`, `record`): `WhatsAppParticipant`

Seed a participant from the chat's roster.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `group` | [`WhatsAppGroup`](../../group/classes/WhatsAppGroup.md) |
| `record` | [`LinkedParticipant`](../../../../../generated/storage/types.gen/type-aliases/LinkedParticipant.md) |

#### Returns

`WhatsAppParticipant`
