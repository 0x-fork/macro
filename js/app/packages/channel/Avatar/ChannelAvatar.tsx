import { cn } from '@ui';
import { createMemo, splitProps, type JSX } from 'solid-js';

import { useChannelAvatarQuery } from './query';
import { renderAvatarSvg, type ChannelAvatarInput } from './render';

export type ChannelAvatarSize = 'sm' | 'md' | 'lg' | 'fill';

const SIZE_CLASSES: Record<ChannelAvatarSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-10',
  fill: 'size-full',
};

const RENDER_PX: Record<ChannelAvatarSize, number> = {
  sm: 32,
  md: 48,
  lg: 80,
  fill: 96,
};

export type ChannelAvatarProps = ChannelAvatarInput & {
  size?: ChannelAvatarSize;
  class?: string;
  title?: string;
  /**
   * When true and avatar fields aren't supplied, kick off an LLM-driven pick
   * (cached forever per name) and render its result. Otherwise the hash
   * fallback is used permanently. Defaults to true.
   */
  autoGenerate?: boolean;
} & Omit<JSX.HTMLAttributes<HTMLSpanElement>, 'innerHTML' | 'children'>;

export function ChannelAvatar(props: ChannelAvatarProps) {
  const [local, rest] = splitProps(props, [
    'avatarIcon',
    'avatarColorFamily',
    'name',
    'size',
    'class',
    'title',
    'autoGenerate',
  ]);
  const size = () => local.size ?? 'md';
  const shouldAutoGenerate = () =>
    (local.autoGenerate ?? true) && !local.avatarIcon && !local.avatarColorFamily;

  const generatedQuery = useChannelAvatarQuery(() =>
    shouldAutoGenerate() ? local.name : undefined
  );

  const effective = createMemo<ChannelAvatarInput>(() => {
    const generated = generatedQuery.data;
    return {
      name: local.name,
      avatarIcon: local.avatarIcon ?? generated?.icon ?? null,
      avatarColorFamily: local.avatarColorFamily ?? generated?.colorFamily ?? null,
    };
  });

  const svg = createMemo(() =>
    renderAvatarSvg(effective(), RENDER_PX[size()])
  );

  return (
    <span
      data-slot="channel-avatar"
      data-size={size()}
      data-avatar-generated={generatedQuery.data ? 'true' : undefined}
      title={local.title ?? local.name}
      class={cn(
        'inline-block shrink-0 select-none overflow-hidden rounded-full',
        SIZE_CLASSES[size()],
        local.class
      )}
      // eslint-disable-next-line solid/no-innerhtml
      innerHTML={svg()}
      {...rest}
    />
  );
}
