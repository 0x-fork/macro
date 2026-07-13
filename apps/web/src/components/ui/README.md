# `@ui` notes

`apps/web/src/components/ui` should contain app-agnostic primitives and small composable building blocks. Components here should be usable without importing app features, query state, hotkey registries, or product-specific copy.

## Component boundary guidance

Good fits:

- Small primitives: buttons, badges, checkboxes, text fields, selects, dialogs, tooltips.
- Composable wrappers over Kobalte/Corvu primitives that provide Macro styling while preserving slots/subcomponents.
- Low-level layout shells such as `Surface`, `Layer`, `Panel`, and `Scroll` when they are not tied to a specific product surface.

Poor fits / candidates to move out:

- `ScreencastHotkeys` — depends on `@app/signal/hotkeyRoot`, persisted app settings, and portal behavior. Better in app or core hotkey code.
- `Hotkey` — depends on `@core/hotkey/*`, platform constants, and core theme types. Better in core hotkey code or a core component package.
- `CollapsedInput` — composer/chat specific, depends on core focus/mobile helpers and send/attachment affordances. Better near AI/chat input code.
- `SendButton` — specific send-message affordance rather than a generic button primitive. Better near composer/chat code.
- `LogoProgress` — brand-specific logo progress indicator. Better in app/brand/core-internal UI.
- `FilteredHiddenBanner` — specific filters copy and behavior. Better near soup/list/filter UI.

Questionable but acceptable if kept generic:

- `EmptyStatePanel` — reusable, but should not depend on `@core` helpers. Prefer caller-provided actions or plain anchor behavior.
- `ChatInput` — layout can be reusable, but the name/slots are composer-specific. Consider renaming/generalizing or moving near chat.
- `NavRow` / `SideNav` — useful app patterns, but not atomic primitives. Keep only if `@ui` intentionally owns opinionated app navigation patterns.

## Composable component pattern

Prefer exposing styled Kobalte/Corvu parts as static properties:

```tsx
<TextField>
  <TextField.Label>Name</TextField.Label>
  <TextField.Input />
  <TextField.Description>Shown below the input.</TextField.Description>
</TextField>
```

For common cases, also export a small convenience wrapper:

```tsx
<TextInput
  label="Name"
  value={name()}
  onChange={setName}
  placeholder="Jane Doe"
/>
```

The convenience wrapper should compose the same parts, not define a separate visual system.

## New form primitives

The package now includes composable wrappers for:

- `Checkbox` / `SimpleCheckbox`
- `TextField` / `TextInput` / `TextArea`
- `NumberField` / `NumberInput`
- `Select` / `SimpleSelect`
- `Combobox` / `SimpleCombobox`

They are intentionally thin wrappers over Kobalte controls with Macro token styling. Keep product-specific rendering in the caller via item slots/components.
