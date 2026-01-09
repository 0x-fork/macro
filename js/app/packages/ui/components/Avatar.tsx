import { type JSX, Show } from 'solid-js';
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
    'h-[1lh] leading-normal! max-h-full aspect-square uppercase rounded-full font-medium font-mono text-surface-0 bg-ink-extra-muted flex justify-center items-center text-center shrink-0',
    props.class
  );

  return (
    <figure class={classes}>
      <Show
        when={props.src}
        fallback={
          <div
            class="w-full h-min flex items-center justify-center"
            classList={{
              'p-[16%]': !!props.children,
            }}
          >
            {props.children ?? <Initials of={props.for} />}
          </div>
        }
      >
        <img
          src={props.src}
          alt={props.for}
          class="rounded-full w-full h-full object-cover overflow-hidden"
        />
      </Show>
    </figure>
  );
}

/**
 * Initials displays a string as abbreviated initials.
 *
 * @component
 * @param {string} props.of - The name to display the initials of.
 */
export function Initials(props: { of: string }) {
  const names = props.of.trim().split(' ').filter(Boolean);
  if (names.length === 0) return '';

  const initials = (
    names.length > 1
      ? `${names[0][0]}${names[names.length - 1][0]}` // First and Last, regardless of what's in the middle
      : names[0][0]
  ).toUpperCase();

  return (
    <abbr
      title={props.of}
      class="max-h-min text-center no-underline font-mono font-medium leading-none text-[calc(1em-10%)]"
    >
      {initials}
    </abbr>
  );
}
