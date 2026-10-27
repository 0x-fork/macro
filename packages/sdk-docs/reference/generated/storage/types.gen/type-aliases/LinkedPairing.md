# Type Alias: LinkedPairing

> **LinkedPairing** = \{ `accountId`: `string`; `expiresAt`: `string`; `id`: `string`; `state`: [`LinkedPairingState`](LinkedPairingState.md); \}

Owner-bound pairing transaction, without its QR or pairing code.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-accountid"></a> `accountId` | `string` | Account being connected. |
| <a id="property-expiresat"></a> `expiresAt` | `string` | Database-assigned deadline. |
| <a id="property-id"></a> `id` | `string` | One-use transaction id. |
| <a id="property-state"></a> `state` | [`LinkedPairingState`](LinkedPairingState.md) | Current state. |
