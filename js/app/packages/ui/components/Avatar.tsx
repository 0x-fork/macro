import { JSX, Show } from 'solid-js';
import { twMerge } from 'tailwind-merge';

type AvatarProps = {
  for: string;
  src?: string | undefined;
  class?: string;
  children?: JSX.Element;
};

/**
 * Avatar renders a visual identifier for a user or entity.
 *
 * @component
 * @param {string} props.for - The name, email, or identifier used to generate initials.
 * @param {string} [props.src] - Optional URL of the avatar image. If absent, initials are shown as fallback.
 * @param {string} [props.class] - Additional CSS classes to apply.
 * @param {JSX.Element} [props.children] - Optional children to display instead of an image.
 */

export function Avatar(props: AvatarProps) {
  const classes = twMerge(
    'h-[1lh] aspect-square text-sm uppercase rounded-full font-medium font-mono text-surface-0 bg-ink-extra-muted flex justify-center items-center text-center shrink-0',
    props.class
  );

  return (
    <figure class={classes}>
      <Show
        when={props.src}
        fallback={props.children ?? <Initials of={props.for} />}
      >
        <img src={props.src} alt={props.for} />
      </Show>
    </figure>
  );
}

/**
 * Initials displays a string as abbreviated initials.
 *
 * @component
 * @param {string} props.of - The name to display the initials of.
 * @param {number} [props.max=2] - The maximum number of initials to display. Default is 2.
 */
export function Initials(props: { of: string; max?: number }) {
  const maxLength = props.max ?? 2;
  const initials = props.of
    .trim()
    .split(' ')
    .map((name) => name[0])
    .slice(0, maxLength)
    .join('')
    .toUpperCase();

  return (
    <abbr title={props.of} class="no-underline">
      {initials}
    </abbr>
  );
}
