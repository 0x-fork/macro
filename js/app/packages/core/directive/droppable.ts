/**
 * Type declaration for the `use:droppable` Solid directive from @thisbeyond/solid-dnd.
 *
 * The directive is created via `createDroppable()` and bound to elements as `use:droppable`.
 * The `false && droppable` pattern is used at each call-site to suppress unused-variable warnings.
 */

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      droppable: boolean;
    }
  }
}

export {};
