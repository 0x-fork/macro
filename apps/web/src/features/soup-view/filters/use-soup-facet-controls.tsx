import { TAGGABLE_LIST_VIEWS } from '@app/constants/list-views';
import { useSoupCollection } from '@app/features/soup-list';
import type { FacetId } from '@app/features/soup-list/facets';
import { NO_ASSIGNEE, NO_STAGE } from '@app/features/soup-list/facets/base';
import { isSearchTaggableType } from '@app/features/soup-list/search-type-capabilities';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useDealStages } from '@companies/crm/deal-stages';
import { CrmStageIcon } from '@companies/crm/StageIcon';
import { EntityIcon } from '@core/component/EntityIcon';
import { UserIcon } from '@core/component/UserIcon';
import {
  ENABLE_SNIPPETS_FLAG,
  ENABLE_SNIPPETS_OVERRIDE,
} from '@core/constant/featureFlags';
import { useQuickAccess } from '@core/context/quickAccess';
import { useUserId } from '@core/context/user';
import { idToDisplayName } from '@core/user/util';
import { EntityIcon as EntityIconWithAvatar } from '@entity/extractors/entity-icon';
import CircleDashedIcon from '@phosphor/circle-dashed.svg';
import { TagDot } from '@property/tags/TagDot';
import { useGithubLinkStatusQuery } from '@queries/auth';
import { useContacts } from '@queries/contacts/contacts';
import { useEmailLinksQuery } from '@queries/email/link';
import { useTagsQuery } from '@queries/properties/tags';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { createEffect, createMemo, type JSX } from 'solid-js';
import { useSoupView } from '../context';
import {
  createSearchFacetController,
  type SoupSearchType,
  sanitizeSearchTypeAvailability,
} from '../list-views/views/search/search-facet-state';
import {
  buildContactLabel,
  type FilterOption,
  VIEW_FACETS,
} from './facet-views';
import {
  encodeInboxSelection,
  inboxActiveIds,
  isNoInboxesSelection,
  selectOnlyInbox,
} from './inbox-selection';

export type SoupFacetControl = {
  id: FacetId;
  label: string;
  labelPlural?: string;
  multiple: boolean;
  searchable?: boolean;
  preserveOrder?: boolean;
  placeholder?: string;
  neutralLabel?: string;
  options: () => FilterOption[];
  activeIds: () => string[];
  onChange: (ids: string[]) => void;
  displayValues?: () => FilterOption[];
  isDefault?: () => boolean;
  reset?: () => void;
  onOnly?: (id: string) => void;
};

const option = (
  id: string,
  label: string,
  icon?: () => JSX.Element
): FilterOption => ({ id, label, icon });

export function useSoupFacetControls() {
  const collection = useSoupCollection();
  const view = useSoupView().view;
  const searchFacetController =
    view() === 'search'
      ? createSearchFacetController(collection.facets)
      : undefined;
  const contacts = useContacts();
  const githubLinkStatus = useGithubLinkStatusQuery({
    enabled: () => view() === 'inbox',
  });
  const { useList: useQuickAccessList } = useQuickAccess();
  const quickAccessChannels = useQuickAccessList('channel', 'dm').items;
  const quickAccessPeople = useQuickAccessList('person').items;
  const teamQuery = useCurrentTeamQuery();
  const dealStages = useDealStages();
  const emailLinksQuery = useEmailLinksQuery();
  const tagsQuery = useTagsQuery();
  const userId = useUserId();
  const snippetsFlag = useFeatureFlag(ENABLE_SNIPPETS_FLAG, {
    enabledOverride: ENABLE_SNIPPETS_OVERRIDE,
  });
  createEffect(() => {
    if (view() !== 'search' || !searchFacetController) return;
    const type = searchFacetController.type();
    const sanitized = sanitizeSearchTypeAvailability(type, {
      snippets: snippetsFlag().enabled,
    });
    if (sanitized !== type) searchFacetController.setType(sanitized);
  });

  const makeControl = (args: {
    id: FacetId;
    label: string;
    labelPlural?: string;
    multiple?: boolean;
    searchable?: boolean;
    preserveOrder?: boolean;
    placeholder?: string;
    neutralLabel?: string;
    options: () => FilterOption[];
    activeIds?: () => string[];
    onChange?: (ids: string[]) => void;
    displayValues?: () => FilterOption[];
    isDefault?: () => boolean;
    reset?: () => void;
    onOnly?: (id: string) => void;
  }): SoupFacetControl => ({
    ...args,
    multiple: args.multiple ?? false,
    activeIds: args.activeIds ?? (() => collection.facets.getSelected(args.id)),
    onChange: args.onChange ?? ((ids) => collection.facets.set(args.id, ids)),
  });

  const assigneeOptions = createMemo(() => {
    const currentUserId = userId();
    const me: FilterOption[] = [];
    const others: FilterOption[] = [];
    for (const contact of contacts()) {
      const value = option(
        contact.id,
        buildContactLabel(contact, currentUserId),
        () => (
          <UserIcon
            id={contact.id}
            size="sm"
            suppressClick
            showTooltip={false}
          />
        )
      );
      if (contact.id === currentUserId) me.push(value);
      else others.push(value);
    }
    others.sort((left, right) => left.label.localeCompare(right.label));
    return [
      ...me,
      option(NO_ASSIGNEE, 'Unassigned', () => (
        <CircleDashedIcon class="size-3.5 text-ink-muted" />
      )),
      ...others,
    ];
  });

  const searchAssigneeOptions = createMemo(() =>
    assigneeOptions().filter((candidate) => candidate.id !== NO_ASSIGNEE)
  );

  const ownerOptions = createMemo(() => {
    const currentUserId = userId();
    const me: FilterOption[] = [];
    const others: FilterOption[] = [];
    for (const member of teamQuery.data?.members ?? []) {
      const id = member.user_id;
      const value = option(
        id,
        buildContactLabel({ id, name: idToDisplayName(id) }, currentUserId),
        () => <UserIcon id={id} size="sm" suppressClick showTooltip={false} />
      );
      if (id === currentUserId) me.push(value);
      else others.push(value);
    }
    others.sort((left, right) => left.label.localeCompare(right.label));
    return [
      ...me,
      option(NO_ASSIGNEE, 'No owner', () => (
        <CircleDashedIcon class="size-3.5 text-ink-muted" />
      )),
      ...others,
    ];
  });

  const stageOptions = createMemo(() => [
    ...dealStages
      .filterStages()
      .map((stage, index) =>
        option(stage.id, stage.label, () => (
          <CrmStageIcon optionId={stage.id} index={index} class="size-3.5" />
        ))
      ),
    option(NO_STAGE, 'No stage', () => (
      <CircleDashedIcon class="size-3.5 text-ink-muted" />
    )),
  ]);

  const tagOptions = createMemo(() =>
    (tagsQuery.data ?? []).flatMap((definition) =>
      definition.options.map((tag) =>
        option(
          tag.id,
          tag.value.type === 'string' ? tag.value.value : tag.id,
          () => <TagDot color={tag.color ?? undefined} />
        )
      )
    )
  );

  const inboxOptions = createMemo(() =>
    (emailLinksQuery.data?.links ?? [])
      .map((link) => option(link.id, link.email_address))
      .sort((left, right) => left.label.localeCompare(right.label))
  );

  const channelOptions = createMemo(() =>
    quickAccessChannels()
      .filter((channel) => channel.data.name)
      .map((channel) =>
        option(channel.id, channel.data.name, () => (
          <div class="size-4">
            <EntityIconWithAvatar
              entity={channel.data}
              suppressClick
              showTooltip={false}
            />
          </div>
        ))
      )
  );

  const personOptions = createMemo(() => {
    const currentUserId = userId();
    const me: FilterOption[] = [];
    const others: FilterOption[] = [];
    for (const person of quickAccessPeople()) {
      const value = option(
        person.id,
        person.id === currentUserId
          ? `${person.data.name || 'Me'} (me)`
          : person.data.name || person.id,
        () => (
          <UserIcon
            id={person.id}
            size="sm"
            suppressClick
            showTooltip={false}
          />
        )
      );
      if (person.id === currentUserId) me.push(value);
      else others.push(value);
    }
    return [...me, ...others];
  });

  const staticControls = () =>
    (VIEW_FACETS[view()] ?? []).map((category) =>
      makeControl({
        id: category.id,
        label: category.label,
        labelPlural: category.labelPlural,
        multiple: category.multiple,
        options: () =>
          category.options.filter((item) => {
            if (item.id === 'github-pr') {
              return githubLinkStatus.data?.status === 'linked';
            }
            if (item.id === 'doc-snippet') return snippetsFlag().enabled;
            return true;
          }),
      })
    );

  const searchControls = (): SoupFacetControl[] => {
    const type = searchFacetController?.type() ?? 'all';
    const controls: SoupFacetControl[] = [
      makeControl({
        id: 'search_type',
        label: 'Type',
        neutralLabel: 'All',
        onChange: (ids) =>
          searchFacetController?.setType((ids[0] as SoupSearchType) ?? 'all'),
        options: () => [
          option('channels', 'Channels', () => (
            <EntityIcon targetType="channel" size="xs" theme="monochrome" />
          )),
          option('document-or-file', 'Documents', () => (
            <EntityIcon targetType="md" size="xs" theme="monochrome" />
          )),
          option('task', 'Tasks', () => (
            <EntityIcon targetType="task" size="xs" theme="monochrome" />
          )),
          option('email', 'Email', () => (
            <EntityIcon targetType="email" size="xs" theme="monochrome" />
          )),
          option('calls', 'Calls', () => (
            <EntityIcon targetType="call" size="xs" theme="monochrome" />
          )),
          option('folders', 'Folders', () => (
            <EntityIcon targetType="project" size="xs" theme="monochrome" />
          )),
          option('agent', 'Agents', () => (
            <EntityIcon targetType="chat" size="xs" theme="monochrome" />
          )),
          ...(snippetsFlag().enabled
            ? [
                option('doc-snippet', 'Snippets', () => (
                  <EntityIcon
                    targetType="snippet"
                    size="xs"
                    theme="monochrome"
                  />
                )),
              ]
            : []),
        ],
      }),
    ];

    if (type === 'email') {
      controls.push(
        makeControl({
          id: 'email_importance',
          label: 'Importance',
          neutralLabel: 'All',
          options: () => [
            option('important', 'Signal'),
            option('noise', 'Noise'),
          ],
        })
      );
      if (inboxOptions().length > 1) {
        controls.push(
          makeControl({
            id: 'email_inbox',
            label: 'Inbox',
            neutralLabel: 'All inboxes',
            multiple: true,
            searchable: true,
            preserveOrder: true,
            placeholder: 'Search inboxes...',
            options: inboxOptions,
            activeIds: () =>
              inboxActiveIds(
                collection.facets.getSelected('email_inbox'),
                inboxOptions().map((option) => option.id)
              ),
            onChange: (ids) =>
              collection.facets.set(
                'email_inbox',
                ids.length === 0
                  ? []
                  : encodeInboxSelection(
                      ids,
                      inboxOptions().map((option) => option.id)
                    )
              ),
            displayValues: () => {
              const selected = collection.facets.getSelected('email_inbox');
              if (selected.length === 0) {
                return [option('all', 'All inboxes')];
              }
              if (isNoInboxesSelection(selected)) {
                return [option('none', 'No inboxes')];
              }
              return selected.map(
                (id) =>
                  inboxOptions().find((candidate) => candidate.id === id) ??
                  option(id, id)
              );
            },
            isDefault: () =>
              collection.facets.getSelected('email_inbox').length === 0,
            reset: () => collection.facets.set('email_inbox', []),
            onOnly: (id) =>
              collection.facets.set(
                'email_inbox',
                selectOnlyInbox(
                  id,
                  collection.facets.getSelected('email_inbox'),
                  inboxOptions().map((option) => option.id)
                )
              ),
          })
        );
      }
    } else if (type === 'channels') {
      controls.push(
        makeControl({
          id: 'channel_in',
          label: 'In',
          neutralLabel: 'All channels',
          multiple: true,
          searchable: true,
          placeholder: 'Search channels...',
          options: channelOptions,
        }),
        makeControl({
          id: 'channel_from',
          label: 'From',
          neutralLabel: 'Anyone',
          multiple: true,
          searchable: true,
          placeholder: 'Search senders...',
          options: personOptions,
        })
      );
    } else if (type === 'calls') {
      controls.push(
        makeControl({
          id: 'call_in',
          label: 'In',
          neutralLabel: 'All channels',
          multiple: true,
          searchable: true,
          placeholder: 'Search channels...',
          options: channelOptions,
        }),
        makeControl({
          id: 'call_from',
          label: 'From',
          neutralLabel: 'Anyone',
          multiple: true,
          searchable: true,
          placeholder: 'Search speakers...',
          options: personOptions,
        }),
        makeControl({
          id: 'call_status',
          label: 'Status',
          neutralLabel: 'All',
          options: () => [
            option('ATTENDED', 'Attended'),
            option('MISSED', 'Missed'),
            option('UNATTENDED', 'Unattended'),
          ],
        })
      );
    } else if (type === 'task') {
      const taskCategories = VIEW_FACETS.tasks;
      const status = taskCategories.find(
        (category) => category.id === 'task_status'
      );
      const priority = taskCategories.find(
        (category) => category.id === 'task_priority'
      );
      if (status) {
        controls.push(
          makeControl({
            id: status.id,
            label: status.label,
            neutralLabel: 'Any status',
            multiple: true,
            options: () => status.options,
          })
        );
      }
      if (priority) {
        controls.push(
          makeControl({
            id: priority.id,
            label: priority.label,
            neutralLabel: 'Any priority',
            multiple: true,
            options: () => priority.options,
          })
        );
      }
      controls.push(
        makeControl({
          id: 'assignee',
          label: 'Assignee',
          neutralLabel: 'Anyone',
          multiple: true,
          searchable: true,
          placeholder: 'Search assignees...',
          options: searchAssigneeOptions,
        }),
        makeControl({
          id: 'task_created_by',
          label: 'Created by',
          neutralLabel: 'Anyone',
          multiple: true,
          searchable: true,
          placeholder: 'Search creators...',
          options: personOptions,
        })
      );
    }

    if (tagOptions().length > 0 && isSearchTaggableType(type)) {
      controls.push(
        makeControl({
          id: 'tag',
          label: 'Tags',
          neutralLabel: 'Any tag',
          multiple: true,
          searchable: true,
          placeholder: 'Search tags...',
          options: tagOptions,
        })
      );
      if (collection.facets.getSelected('tag').length >= 2) {
        controls.push(
          makeControl({
            id: 'tag_mode',
            label: 'Match',
            neutralLabel: 'Any of',
            options: () => [option('all', 'All of')],
          })
        );
      }
    }

    return controls;
  };

  const dynamicControls = (): SoupFacetControl[] => {
    if (view() === 'search') return searchControls();
    const result: SoupFacetControl[] = [];
    if (view() === 'tasks') {
      result.push(
        makeControl({
          id: 'assignee',
          label: 'Assignee',
          labelPlural: 'Assignees',
          multiple: true,
          searchable: true,
          placeholder: 'Search assignees...',
          options: assigneeOptions,
        })
      );
    }
    if (view() === 'companies') {
      result.push(
        makeControl({
          id: 'company_stage',
          label: 'Stage',
          labelPlural: 'Stages',
          multiple: true,
          searchable: true,
          placeholder: 'Search stages...',
          preserveOrder: true,
          options: stageOptions,
        }),
        makeControl({
          id: 'company_owner',
          label: 'Owner',
          labelPlural: 'Owners',
          multiple: true,
          searchable: true,
          placeholder: 'Search owners...',
          options: ownerOptions,
        })
      );
    }
    if (tagOptions().length > 0 && TAGGABLE_LIST_VIEWS.has(view())) {
      result.push(
        makeControl({
          id: 'tag',
          label: 'Tag',
          labelPlural: 'Tags',
          multiple: true,
          searchable: true,
          placeholder: 'Search tags...',
          options: tagOptions,
        })
      );
      if (collection.facets.getSelected('tag').length >= 2) {
        result.push(
          makeControl({
            id: 'tag_mode',
            label: 'Match',
            neutralLabel: 'Any of',
            options: () => [option('all', 'All of')],
          })
        );
      }
    }
    return result;
  };

  return () => [...staticControls(), ...dynamicControls()];
}
