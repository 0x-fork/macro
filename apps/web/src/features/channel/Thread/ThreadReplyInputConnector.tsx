/**
 * Connector from the inner vertical rail to the reply input area — a
 * border-drawn elbow (vertical drop, rounded turn, horizontal arm ending at
 * the input's vertical center). Border-drawn so it rasterizes at the same
 * 1px weight as the straight rail segments.
 *
 * Must be rendered inside a `position: relative` wrapper whose left edge
 * is at `icon-width/2` to the right of the inner rail.
 */
export function ThreadReplyInputConnector() {
  return (
    <div
      class="pointer-events-none absolute top-0 -z-1 border-l border-b border-rail rounded-bl-[14px]"
      style={{
        left: 'calc((var(--user-icon-width) / 2) * -1)',
        width: 'calc(var(--user-icon-width) / 2 + 1px)',
        bottom: '50%',
      }}
    />
  );
}
