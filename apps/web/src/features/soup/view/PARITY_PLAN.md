# Isolated Soup parity plan

## Goal

Finish the replacement `components/list` and `features/soup` implementation
without routing any existing app surface to
it. Integration with the sidebar, split registry, Command Menu, shared rows, and
legacy providers is a separate future change.

## Isolation contract

- Production changes stay under:
  - `apps/web/src/components/list/`
  - `apps/web/src/features/soup/collection/`
  - `apps/web/src/features/soup/view/`
- The replacement may consume stable existing UI/query primitives, but it must
  not change existing routes, controllers, shared entity rows, sidebar flows, or
  legacy Soup state.
- New external controller APIs live in `features/soup/view` until the integration
  PR intentionally bridges them.
- Preserve the facet store as the only replacement filter state.

## Phases

1. **Facet control surface**
   - Active facet chips and Clear All.
   - Dynamic Task assignee, document/task tags, and Company stage/owner filters.
   - Mail inbox tri-state selector.
   - Global Search type-specific facet row.
   - Feature-gate and unavailable-option handling.

2. **List presentation and actions**
   - Task/Company column headers and specialized group headers.
   - Filtered/search/loading/empty states.
   - Replacement-owned entity context menu/action model.
   - File/folder drop surface.
   - Complete preview and action hotkeys.

3. **Companies**
   - Facet-native board/list rendering.
   - Permission-aware stage drag/drop.
   - Facet-native personal/team saved-view capture and apply.
   - Display options, hidden-company state, and CRM-unavailable states.

4. **Mobile/responsive**
   - Mobile tabs, filters, search, and create controls.
   - Swipe actions, long-press actions, touch highlighting, and safe-area rows.
   - Narrow desktop collapsed tabs/search.

5. **Data and lifecycle parity**
   - GraphQL/reactive flat transport with REST/grouped fallback.
   - Source-owned pagination across REST/grouped and reactive flat sources.
   - Match-none transport for client-only Automations.
   - Gated restored-facet sanitization.
   - Split/session ownership for persistent navigation hotkeys.

6. **Parity proof**
   - Selection-to-request-to-render integration tests for browse, Search, and
     grouped inputs.
   - Tab, persistence, Mail inbox, CRM, actions, GraphQL fallback, and mobile
     interaction tests.
   - Manual desktop/mobile parity checklist before the later integration PR.

## Current isolated progress

- Facet controls are implemented, including Mail tri-state selection, dynamic
  options, active chips, tag any/all mode, Search section stashing, and gated
  Search type restoration.
- List presentation includes Task/Company headers, specialized group headers,
  featured Search sections, sort-aware timestamps, filter-aware empty states,
  preview, selection, and production-equivalent replacement action commands and
  hotkeys.
- Companies have responsive facet-native List/Board rendering, mobile mode
  controls, permission-aware Stage drag/drop, production-compatible personal and
  team saved views, pin/default loading, permission-sanitized Hidden state, and
  complete CRM unavailable/error surfaces. View mode and preview persistence are
  owned by the always-mounted provider, including pending preview-ID restoration.
- Inbox disables local fuzzy Search, stays flat in legacy mode, switches to
  client date grouping in New Inbox mode, and applies the asynchronous New Inbox
  preview default without overriding persisted preview intent.
- Mobile has replacement-owned tabs, filters, Search, create controls,
  long-press selection/actions, and Mark Done swipe behavior. Narrow-desktop
  overflow and additional domain-specific actions remain.
- Flat transport uses reactive GraphQL when supported, GraphQL-to-REST fallback
  otherwise, and REST for grouped requests. REST and reactive queries are
  interchangeable browse sources that own their pagination independently.
  Persistent J/K registrations are owned and replaced per split scope.
- Semantic/model coverage includes facet algebra/transport, Search normalization,
  Mail tri-state behavior, presentation ordering, Company board/view behavior,
  action targeting, reactive fallback, navigation ownership, and generic List
  behavior. Additional mounted end-to-end interaction coverage remains.

## Stop rule

Do not modify an existing app callsite to exercise the replacement. Add isolated
component/model tests or a feature-local harness instead.
