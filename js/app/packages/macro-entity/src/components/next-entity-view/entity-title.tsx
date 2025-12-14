import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { unifiedListMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { emailToId, useDisplayName } from '@core/user';
import {
  type EmailEntity,
  type EntityData,
  isSearchEntity,
} from '@macro-entity';
import { useEmail } from '@service-gql/client';
import { createMemo, Match, Show, Switch } from 'solid-js';

export const EntityTitle = (props: {
  entity: EntityData;
  showUnrollNotifications?: boolean;
}) => {
  return (
    <Switch>
      <Match when={props.entity.type === 'email' && props.entity}>
        {(entity) => <EmailEntityTitle entity={entity()} />}
      </Match>
      <Match when={true}>
        <GeneralEntityTitle
          entity={props.entity}
          showUnrollNotifications={props.showUnrollNotifications}
        />
      </Match>
    </Switch>
  );
};

const GeneralEntityTitle = (props: {
  entity: EntityData;
  showUnrollNotifications?: boolean;
}) => {
  const searchHighlightName = () =>
    isSearchEntity(props.entity) && props.entity.search.nameHighlight;

  const channelEntity = createMemo(() =>
    props.entity.type === 'channel' ? props.entity : null
  );

  const latestMessageContent = createMemo(
    () => channelEntity()?.latestMessage?.content
  );

  const userNameFromSender = createMemo(() => {
    const senderId = channelEntity()?.latestMessage?.senderId;
    if (!senderId) return;
    const [userName] = useDisplayName(senderId);
    return userName();
  });

  const showLatestMessageInfo = () => {
    return (
      !props.showUnrollNotifications &&
      props.entity.type === 'channel' &&
      !isSearchEntity(props.entity) &&
      !!props.entity.latestMessage?.content
    );
  };

  return (
    <div class="flex gap-2 items-center min-w-0 w-fit max-w-full overflow-hidden">
      <span class="flex gap-1 truncate font-medium text-sm shrink-0 items-center">
        <span
          class="font-semibold truncate"
          classList={{
            'w-[20cqw]': !props.showUnrollNotifications,
          }}
        >
          <Show when={searchHighlightName()} fallback={props.entity.name}>
            {(name) => (
              <StaticMarkdown
                markdown={name()}
                theme={unifiedListMarkdownTheme}
                singleLine={true}
              />
            )}
          </Show>
        </span>

        <Show when={showLatestMessageInfo()}>
          <div class="flex items-center gap-1">
            <span class="font-medium shrink-0 truncate">
              {userNameFromSender()}
            </span>
          </div>
          <Show when={latestMessageContent()}>
            {(lastMessageContent) => (
              <div class="truncate shrink grow opacity-60 flex items-center">
                <StaticMarkdown
                  markdown={lastMessageContent().trim()}
                  theme={unifiedListMarkdownTheme}
                  singleLine={true}
                />
              </div>
            )}
          </Show>
        </Show>
      </span>
    </div>
  );
};

const EmailEntityTitle = (props: { entity: EmailEntity }) => {
  const userEmail = useEmail();
  const searchHighlightName = () =>
    isSearchEntity(props.entity) && props.entity.search.nameHighlight;

  const isLikelyEmail = (value?: string) =>
    typeof value === 'string' && value.includes('@');

  const combinedParticipantFirstNames = createMemo(() => {
    if (props.entity.type !== 'email') return [];

    const me = userEmail();

    if (
      props.entity.participants?.length === 1 &&
      props.entity.participants?.[0].email === me
    ) {
      return ['me'];
    }

    const namesSet = new Set<string>();

    for (const participant of props.entity.participants ?? []) {
      if (!participant.email) continue;

      if (me && participant.email === me) continue;

      const [_macroDisplayName] = useDisplayName(emailToId(participant.email));

      const macroDisplayName = _macroDisplayName();

      const macroFirstName = macroDisplayName?.split(' ')[0];

      const participantFirstName = participant.name?.split(' ')[0] ?? '';

      if (macroFirstName && !isLikelyEmail(macroFirstName)) {
        namesSet.add(macroFirstName);
        continue;
      }

      if (participantFirstName && !isLikelyEmail(participantFirstName)) {
        namesSet.add(participantFirstName);
        continue;
      }

      const emailName = participant.email.split('@')[0];
      namesSet.add(emailName);
    }

    return Array.from(namesSet);
  });

  const displayedNames = () => {
    const names = combinedParticipantFirstNames();

    if (!names || names.length === 0) return undefined;

    if (names.length <= 3) return names.join(', ');

    return `${names[0]} .. ${names[names.length - 2]}, ${names[names.length - 1]}`;
  };

  return (
    <div class="flex gap-1 items-center text-sm min-w-0 w-full truncate overflow-hidden">
      {/* sometimes senderName and senderEmail are the same */}
      <div class="flex w-[20cqw] gap-2 font-semibold shrink-0">
        {/* Sender Name */}
        <div class="truncate">
          {displayedNames() ??
            props.entity.senderName ??
            props.entity.senderEmail?.split('@')[0]}
        </div>
      </div>
      {/* Subject */}
      <div class="flex items-center w-full gap-4 flex-1 min-w-0">
        <div class="font-medium shrink-0 truncate">
          <Show when={searchHighlightName()} fallback={props.entity.name}>
            {(name) => (
              <StaticMarkdown
                markdown={name()}
                theme={unifiedListMarkdownTheme}
                singleLine={true}
              />
            )}
          </Show>
        </div>
        {/* Body  */}
        <div class="truncate shrink grow opacity-60">
          {props.entity.snippet}
        </div>
      </div>
    </div>
  );
};
