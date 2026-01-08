import { Show } from 'solid-js';
import { twMerge } from 'tailwind-merge';

type AvatarProps = {
  for: string;
  overrideInitials?: string;
  src?: string;
  class?: string;
};

export function Avatar(props: AvatarProps) {
  const initials = () =>
    props.overrideInitials?.toUpperCase() ??
    props.for
      .trim()
      .split(' ')
      .map((name) => name[0])
      .slice(0, 3)
      .join('')
      .toUpperCase();

  const fallback = () => <div>{initials()}</div>;

  const classes = twMerge(
    'bg-[#fc0] aspect-square text-sm uppercase rounded-full font-bold font-mono outline flex justify-center items-center text-center',
    props.class
  );

  return (
    <figure class={classes}>
      <Show when={props.src} fallback={fallback()}>
        <img src={props.src} alt={props.for} />
      </Show>
    </figure>
  );
}
