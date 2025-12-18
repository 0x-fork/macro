import { observedSize } from '@core/directive/observedSize';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { formatDate } from '@core/util/date';
import IconPlus from '@icon/regular/plus.svg';
import {
  type Accessor,
  type Component,
  createContext,
  createMemo,
  createSignal,
  type JSX,
  type Setter,
  Show,
  splitProps,
  useContext,
} from 'solid-js';
import { BozzyBracket } from './BozzyBracket';
import {
  CustomEntityIcon,
  EntityIcon,
  type EntityWithValidIcon,
} from './EntityIcon';
import { IconButton } from './IconButton';
import { UserIcon } from './UserIcon';

false && observedSize;

export type MessageRootProps = {
  id?: string;
  focused: boolean;
  unfocusable?: boolean;
  senderId?: string;
  customIcon?: Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  customIconTargetType?: EntityWithValidIcon;
  isFirstMessage: boolean;
  isLastMessage: boolean;
  isConsecutive?: boolean;
  hoverActions?: JSX.Element;
  shouldHover?: boolean;
  threadDepth?: number;
  hasThreadChildren?: boolean;
  isFirstInThread?: boolean;
  isLastInThread?: boolean;
  isDeleted?: boolean;
  isNewMessage?: boolean;
  isParentNewMessage?: boolean;
  shouldShowThreadAppendInput?: boolean;
  setThreadAppendMountTarget?: (el: HTMLElement) => void;
  onThreadAppend?: () => void;
  hideConnectors?: boolean;
  children: JSX.Element;
  setMessageBodyRef?: Setter<HTMLDivElement | undefined>;
  isTarget?: boolean;
  isBorderHovered?: boolean;
  setBorderHovered?: Setter<boolean>;
  isThreadExpanded?: boolean;
};

type MessageContextValue = {
  focused: boolean;
  isFirstMessage: boolean;
  isLastMessage: boolean;
  isConsecutive?: boolean;
  hoverActions?: JSX.Element;
  threadDepth?: number;
  isFirstInThread?: boolean;
  isLastInThread?: boolean;
  isDeleted?: boolean;
  hover: Accessor<boolean>;
  setHover: Setter<boolean>;
};

const MessageContext = createContext<MessageContextValue>();
export function useMessageContext(): MessageContextValue {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error('Message.* must be used within <Message>');
  return ctx;
}

/* TopBar */

export type MessageTopBarSimpleProps = {
  name: string;
  timestamp?: string;
  tagLabel?: string;
  tagIcon?: Component<JSX.SvgSVGAttributes<SVGSVGElement>> | undefined;
};

export type MessageTopBarChildrenProps = {
  children: JSX.Element;
};

export type MessageTopBarProps =
  | MessageTopBarSimpleProps
  | MessageTopBarChildrenProps;

function isTopBarChildrenProps(
  props: MessageTopBarProps
): props is MessageTopBarChildrenProps {
  return 'children' in props;
}

const TopBar: Component<MessageTopBarProps> = (props) => {
  const context = useMessageContext();

  if (isTopBarChildrenProps(props)) {
    return props.children;
  }

  const [local] = splitProps(props as MessageTopBarSimpleProps, [
    'name',
    'timestamp',
    'tagLabel',
    'tagIcon',
  ]);
  return (
    <Show when={!context.isConsecutive}>
      <div class="font-mono flex flex-row items-center justify-between">
        {/*  Name */}
        <div class="shrink-1 min-w-0 text-sm truncate text-ink-muted">
          {local.name}
        </div>
        {/* Tag */}
        <Show when={local.tagLabel}>
          <div class="inline-flex items-center ml-2 px-0.5 text-xs bg-edge/15 text-ink border-1 border-edge/30 max-w-[240px] min-w-0">
            <div class="flex-shrink-0 px-0.5">
              <Show when={local.tagIcon}>
                <CustomEntityIcon icon={local.tagIcon!} size="xs" />
              </Show>
            </div>
            <span class="truncate">{local.tagLabel}</span>
          </div>
        </Show>
        {/* Date */}
        <Show when={local.timestamp}>
          <div class="text-xs text-ink-muted">
            {local.timestamp &&
              formatDate(new Date(local.timestamp).getTime() / 1000)}
          </div>
        </Show>
      </div>
    </Show>
  );
};

/* Body */

export type MessageBodyProps = {
  children: JSX.Element;
  isDeleted?: boolean;
};

const Body: Component<MessageBodyProps> = (props) => {
  return (
    <Show
      when={!props.isDeleted}
      fallback={
        <div class="text-xs text-ink-muted font-mono">Message Deleted</div>
      }
    >
      <div class="text-sm text-ink pr-4">{props.children}</div>
    </Show>
  );
};

type NestedConnectorLinesProps = {
  threadDepth?: number;
  isParentNewMessage?: boolean;
  hover?: () => boolean;
  onHoverChange?: (hover: boolean) => void;
};

export const NestedConnectorLines: Component<NestedConnectorLinesProps> = (
  props
) => {
  const NestedLines: JSX.Element[] = [];
  for (let i = 0; i < (props.threadDepth ?? 0); i++) {
    NestedLines.push(
      <div
        class="absolute h-full pointer-events-auto"
        style={{
          left: `calc(${i} * var(--thread-shift) + var(--left-of-connector) - 5px)`,
          width: '11px',
        }}
        onMouseEnter={() => props.onHoverChange?.(true)}
        onMouseLeave={() => props.onHoverChange?.(false)}
      >
        <div
          class="absolute h-full border-l"
          classList={{
            'border-accent': props.isParentNewMessage,
            'border-edge-muted': !props.isParentNewMessage,
            'border-white': props.hover?.(),
          }}
          style={{
            left: '5px',
          }}
        />
      </div>
    );
  }

  return (
    <div class="absolute left-0 top-0 w-full h-full z-1 pointer-events-none">
      {NestedLines}
    </div>
  );
};

/* Root */

const Root: Component<MessageRootProps> = (props) => {
  const [localHover, setLocalHover] = createSignal(false);
  const internalHover = () => localHover();
  const borderHovered = () => props.isBorderHovered ?? false;
  const setHover = (value: boolean) => {
    setLocalHover(value);
  };
  const canBorderHover = () => {
    return props.isThreadExpanded || (props.threadDepth ?? 0) > 0;
  };
  const setBorderHover = (value: boolean) => {
    if (!canBorderHover()) return;
    props.setBorderHovered?.(value);
  };
  const [replySize, setReplySize] = createSignal<DOMRect>();
  const ctx: MessageContextValue = {
    focused: props.focused,
    isFirstMessage: props.isFirstMessage,
    isLastMessage: props.isLastMessage,
    isConsecutive: props.isConsecutive,
    hoverActions: props.hoverActions,
    threadDepth: props.threadDepth,
    isFirstInThread: props.isFirstInThread,
    isLastInThread: props.isLastInThread,
    isDeleted: props.isDeleted,
    hover: internalHover,
    setHover: setHover,
  };

  const replyHeight = createMemo(() => {
    return replySize()?.height ?? 0;
  });

  return (
    <MessageContext.Provider value={ctx}>
      <div
        class={`relative flex flex-row items-stretch w-full suppress-css-brackets [--thread-shift:23px] @sm:[--thread-shift:46px] [--user-icon-width:30px] @sm:[--user-icon-width:40px] [--left-of-connector:20px] @sm:[--left-of-connector:28px] [--left-of-user-icon:calc(var(--left-of-connector)-var(--user-icon-width)/2)] transition-colors duration-1000 ease`}
        classList={{
          'bg-accent': props.isTarget,
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Show when={!props.hideConnectors}>
          <NestedConnectorLines
            threadDepth={props.threadDepth}
            isParentNewMessage={props.isParentNewMessage}
            hover={borderHovered}
            onHoverChange={setBorderHover}
          />
        </Show>
        <BozzyBracket
          active={props.focused}
          unfocusable={props.isTarget || props.unfocusable}
          class="flex flex-row"
          style={{
            'margin-bottom': props.isLastInThread //|| props.showReply?.()
              ? `${replyHeight()}px`
              : '0px',
          }}
          hover={props.shouldHover || internalHover()}
        >
          {/* Message Wrapper w/ Main Connector Line */}
          <div
            class="w-full"
            style={{
              'padding-left': `calc(${props.threadDepth ?? 0} * var(--thread-shift))`,
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            tabIndex={props.isDeleted || props.unfocusable ? -1 : 0}
            ref={props.setMessageBodyRef}
            data-message-body-id={props.id}
          >
            <div
              class="relative flex-1 flex flex-col justify-start w-[calc(100%-28px)] min-w-0 pl-[var(--left-of-connector)]"
              classList={{
                'pt-4': !(
                  props.isConsecutive ||
                  props.isFirstMessage ||
                  props.isFirstInThread
                ),
                'pb-2': props.isLastMessage && !props.isLastInThread,
                'pb-4': props.hasThreadChildren ?? false,
              }}
              style={{
                'margin-left': `var(--left-of-connector)`,
              }}
            >
              <Show when={!props.hideConnectors}>
                <div
                  class="absolute top-0"
                  style={{
                    left: '-5px',
                    width: '11px',
                    height: 'var(--user-icon-width)',
                  }}
                  onMouseEnter={() => setBorderHover(true)}
                  onMouseLeave={() => setBorderHover(false)}
                >
                  <div
                    class="absolute border-l"
                    classList={{
                      'border-accent': props.isNewMessage ?? false,
                      'border-edge-muted': !props.isNewMessage,
                      'border-white':
                        borderHovered() && (props.threadDepth ?? 0) > 0,
                    }}
                    style={{
                      left: '5px',
                      height: '100%',
                    }}
                  />
                </div>
                <div
                  class="absolute"
                  style={{
                    left: '-5px',
                    top: 'var(--user-icon-width)',
                    width: '11px',
                    height: 'calc(100% - var(--user-icon-width))',
                  }}
                  onMouseEnter={() => setBorderHover(true)}
                  onMouseLeave={() => setBorderHover(false)}
                >
                  <div
                    class="absolute border-l"
                    classList={{
                      'border-accent': props.isNewMessage ?? false,
                      'border-edge-muted': !props.isNewMessage,
                      'border-white': borderHovered(),
                    }}
                    style={{
                      left: '5px',
                      height: '100%',
                    }}
                  />
                </div>
              </Show>
              {/* User Icon */}
              <div class="absolute -left-[.5px] -translate-x-1/2">
                <Show when={!props.isConsecutive}>
                  <div class="relative">
                    <Show when={props.isFirstInThread}>
                      <div
                        class="absolute"
                        style={{
                          left: `calc((var(--thread-shift) - var(--left-of-connector) + var(--left-of-user-icon) + 0.5px) * -1 - 5px)`,
                          top: '.5px',
                          width: `calc(var(--thread-shift) - var(--left-of-connector) + var(--left-of-user-icon) + 0.5px + 10px)`,
                          height: 'calc(50% + 5px)',
                        }}
                        onMouseEnter={() => setBorderHover(true)}
                        onMouseLeave={() => setBorderHover(false)}
                      >
                        <div
                          class="absolute border-b border-l"
                          classList={{
                            'border-edge-muted': !borderHovered(),
                            'border-white': borderHovered(),
                          }}
                          style={{
                            left: '5px',
                            top: '0',
                            width: `calc(100% - 10px)`,
                            height: 'calc(100% - 5px)',
                            'border-bottom-left-radius': `calc(var(--thread-shift) / 2)`,
                          }}
                        />
                      </div>
                    </Show>
                    <Show
                      when={props.customIcon || props.customIconTargetType}
                      fallback={
                        <div
                          class="flex justify-center items-center"
                          style={{
                            width: `var(--user-icon-width)`,
                            height: `var(--user-icon-width)`,
                          }}
                        >
                          <UserIcon
                            id={props.senderId ?? ''}
                            isDeleted={false}
                            size="fill"
                            suppressClick={true}
                          />
                        </div>
                      }
                    >
                      <div
                        class="flex justify-center items-center"
                        style={{
                          width: `var(--user-icon-width)`,
                          height: `var(--user-icon-width)`,
                        }}
                      >
                        <EntityIcon
                          targetType={props.customIconTargetType}
                          size="fill"
                        />
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
              {/* Message Body */}
              {props.children}
            </div>
          </div>
        </BozzyBracket>
        <Show when={props.hoverActions && !isTouchDevice}>
          <div
            class="absolute right-2 -top-2 border border-edge bg-panel"
            classList={{
              block: internalHover() || !!props.shouldHover,
              hidden: !(internalHover() || !!props.shouldHover),
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            {props.hoverActions}
          </div>
        </Show>
        <Show when={props.isLastInThread}>
          <div
            class="absolute bottom-0 w-full"
            use:observedSize={{
              setSize: setReplySize,
            }}
          >
            <Show
              when={props.shouldShowThreadAppendInput}
              fallback={
                <div
                  class="w-min -translate-x-1/2 icon-plus allow-css-brackets"
                  classList={{
                    'pb-3': props.isLastInThread && props.isLastMessage,
                  }}
                  style={{
                    'margin-left': `calc(var(--thread-shift) + var(--left-of-connector))`,
                  }}
                  onMouseEnter={() => setHover(false)}
                >
                  <IconButton
                    icon={IconPlus}
                    theme="base"
                    iconSize={16}
                    onClick={props.onThreadAppend}
                    border
                    tabIndex={0}
                  />
                </div>
              }
            >
              <div
                class="relative"
                classList={{
                  'pb-3': props.isLastInThread && props.isLastMessage,
                }}
                style={{
                  'margin-left': `calc(var(--left-of-connector) + var(--thread-shift) + var(--user-icon-width) / 2)`,
                }}
                onMouseEnter={() => setHover(false)}
                ref={(el) => props.setThreadAppendMountTarget?.(el)}
              >
                <div
                  class="absolute border-b border-l border-edge-muted"
                  style={{
                    left: `calc((var(--user-icon-width) / 2) * -1)`,
                    width: `calc(var(--user-icon-width) / 2)`,
                    height: '50%',
                    'border-bottom-left-radius': `calc(var(--thread-shift) / 2)`,
                  }}
                />
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </MessageContext.Provider>
  );
};

export const Message = Object.assign(Root, {
  TopBar,
  Body,
});
