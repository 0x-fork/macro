# Soup facet store

This is the filtering engine for `features/soup-list`. It is intentionally not
in `components/list`: it knows Soup backend targets and `EntityData`.

State is a selection map:

```ts
Record<facetId, optionId[]>
```

Selected options combine with their facet's `mode` (`or` or `and`), facets AND
together per backend target, and backend targets remain independent. A facet
can also provide client predicates for local/search/cache filtering.

```ts
const facets = createFacetStore(catalog, { initialSelection });
facets.toggle('type', 'doc-markdown');
facets.set('task_status', ['task-not-started', 'task-in-progress']);
facets.compile(context); // Soup backend AST
facets.test(entity, context); // client path
facets.serialize(); // persistence-safe selection
```

View labels, icons, menus, and tab policy do not belong here. They live under
`features/soup-view`.
