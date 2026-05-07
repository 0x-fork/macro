import { cn } from '@ui/utils/classname';
import { UserIcon } from '@core/component/UserIcon';
import { useMessage } from './context';

type SenderIconProps = {
  class?: string;
  hidden?: boolean;
  size?: 'sm' | 'md' | 'default';
};

const sizeClasses = {
  sm: 'size-6',
  md: 'size-8',
  default: 'size-(--user-icon-width)',
};

export function SenderIcon(props: SenderIconProps) {
  const message = useMessage();
  const sizeClass = () => sizeClasses[props.size ?? 'md'];

  return (
    <div
      class={cn('shrink-0', sizeClass(), props.class, {
        invisible: props.hidden,
      })}
      aria-hidden={props.hidden ? 'true' : undefined}
    >
      {!props.hidden && <UserIcon id={message().sender_id} size="fill" />}
    </div>
  );
}
