import {
  PROPERTY_OPTION_IDS,
  SYSTEM_PROPERTY_IDS,
} from '@core/component/Properties/constants';
import { PropertyValue } from '@core/component/Properties/component/propertyValue/PropertyValue';
import {
  PropertiesProvider,
  usePropertiesContext,
  type PropertySaveHandler,
} from '@core/component/Properties/context/PropertiesContext';
import { Modals } from '@core/component/Properties/component/modal';
import { Tooltip } from '@core/component/Tooltip';
import { PropertyTooltip } from '@core/component/Properties/component/propertyValue/PropertyTooltip';
import type {
  Property,
  PropertyApiValues,
} from '@core/component/Properties/types';
import StatusCanceled from '@macro-icons/square/task-cancelled.svg';
import StatusCreated from '@macro-icons/square/task-created.svg';
import StatusDone from '@macro-icons/square/task-done.svg';
import StatusInProgress from '@macro-icons/square/task-in-progress.svg';
import StatusInReview from '@macro-icons/square/task-in-review.svg';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import {
  useSaveEntityPropertyMutation,
  useEntityPropertiesQuery,
} from '@queries/properties/entity';
import { createRenameDssEntityMutation } from '@macro-entity';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import { cn } from '@ui/utils/classname';
import { getSelectValues } from '@core/component/Properties/utils';
import type { LexicalEditor } from 'lexical';

export type InlineTaskEditorProps = {
  taskId: string;
  taskName: string;
  onNameChange?: (newName: string) => void;
  editor?: LexicalEditor;
};

/** Filters and sorts properties to show only Status, Priority, and Assignees */
function getKeyProperties(properties: Property[]): Property[] {
  const keyPropIds: string[] = [
    SYSTEM_PROPERTY_IDS.STATUS,
    SYSTEM_PROPERTY_IDS.PRIORITY,
    SYSTEM_PROPERTY_IDS.ASSIGNEES,
  ];

  const order: Record<string, number> = {
    [SYSTEM_PROPERTY_IDS.STATUS]: 0,
    [SYSTEM_PROPERTY_IDS.PRIORITY]: 1,
    [SYSTEM_PROPERTY_IDS.ASSIGNEES]: 2,
  };

  return properties
    .filter((p) => keyPropIds.includes(p.propertyDefinitionId))
    .sort(
      (a, b) =>
        (order[a.propertyDefinitionId] ?? 99) -
        (order[b.propertyDefinitionId] ?? 99)
    );
}

/** Square status icon component for inline task editor */
function SquareStatusIcon(props: { property: Property }) {
  const context = usePropertiesContext();

  const statusId = createMemo(() => {
    if (props.property.valueType !== 'SELECT_STRING') return null;
    const values = getSelectValues(props.property);
    return values.length > 0 ? values[0] : null;
  });

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    context.openPropertyEditor(props.property, target);
  };

  return (
    <Tooltip
      unstyled
      tooltip={<PropertyTooltip property={props.property} />}
      class="flex items-center"
    >
      <div
        class={cn(
          'inline-flex items-center justify-center size-6 transition-colors cursor-pointer',
          'hover:bg-hover/50 rounded-xs'
        )}
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <Switch
          fallback={<StatusCreated class="size-4 text-ink-extra-muted" />}
        >
          <Match when={statusId() === PROPERTY_OPTION_IDS.STATUS.NOT_STARTED}>
            <StatusCreated class="size-4 text-ink-extra-muted" />
          </Match>
          <Match when={statusId() === PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS}>
            <StatusInProgress class="size-4 text-ink" />
          </Match>
          <Match when={statusId() === PROPERTY_OPTION_IDS.STATUS.IN_REVIEW}>
            <StatusInReview class="size-4 text-success-ink" />
          </Match>
          <Match when={statusId() === PROPERTY_OPTION_IDS.STATUS.COMPLETED}>
            <StatusDone class="size-4 text-accent" />
          </Match>
          <Match when={statusId() === PROPERTY_OPTION_IDS.STATUS.CANCELED}>
            <StatusCanceled class="size-4 text-ink-extra-muted" />
          </Match>
        </Switch>
      </div>
    </Tooltip>
  );
}

/**
 * Inline task editor component that provides:
 * - Clickable status icon with square icons (uses same modals as ListEntity)
 * - Inline priority and assignee display on the right
 * - Click-to-edit title
 */
export function InlineTaskEditor(props: InlineTaskEditorProps) {
  const [isEditingTitle, setIsEditingTitle] = createSignal(false);
  const [editedTitle, setEditedTitle] = createSignal(props.taskName);
  let inputRef: HTMLInputElement | undefined;

  // Fetch task properties
  const propertiesQuery = useEntityPropertiesQuery(
    () => EntityType.TASK,
    () => props.taskId,
    false
  );

  // Mutations
  const saveMutation = useSaveEntityPropertyMutation();
  const renameMutation = createRenameDssEntityMutation();

  // Get key properties (status, priority, assignees)
  const keyProperties = createMemo((): Property[] => {
    const properties = propertiesQuery.data ?? [];
    return getKeyProperties(properties);
  });

  // Get status property for the icon
  const statusProperty = createMemo(() => {
    return keyProperties().find(
      (p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.STATUS
    );
  });

  // Get non-status properties (priority, assignees) for the right side
  const otherProperties = createMemo(() => {
    return keyProperties().filter(
      (p) => p.propertyDefinitionId !== SYSTEM_PROPERTY_IDS.STATUS
    );
  });

  // Save handler for PropertiesProvider
  const saveHandler: PropertySaveHandler = {
    saveProperty: (property: Property, value: PropertyApiValues) =>
      saveMutation.mutateAsync({
        entityId: props.taskId,
        entityType: EntityType.TASK,
        property,
        apiValues: value,
      }),
    saveDate: (property: Property, date: Date) =>
      saveMutation.mutateAsync({
        entityId: props.taskId,
        entityType: EntityType.TASK,
        property,
        apiValues: {
          valueType: 'DATE',
          value: date,
        },
      }),
  };

  // Handle title editing
  const startEditingTitle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditedTitle(props.taskName);
    setIsEditingTitle(true);
  };

  const saveTitle = async () => {
    if (!isEditingTitle()) return; // Guard against double saves
    const newTitle = editedTitle().trim();
    setIsEditingTitle(false);

    // Focus back to the Lexical editor
    props.editor?.focus();

    if (newTitle && newTitle !== props.taskName) {
      try {
        await renameMutation.mutateAsync({
          entity: {
            id: props.taskId,
            type: 'document',
            name: props.taskName,
          },
          newName: newTitle,
        });
        props.onNameChange?.(newTitle);
      } catch (error) {
        console.error('Failed to rename task:', error);
      }
    }
  };

  const cancelEditingTitle = () => {
    setEditedTitle(props.taskName);
    setIsEditingTitle(false);
    props.editor?.focus();
  };

  // Focus input and attach native event listeners when editing starts
  createEffect(() => {
    if (isEditingTitle() && inputRef) {
      inputRef.focus();
      inputRef.select();

      // Use native event listeners since Lexical may intercept SolidJS events
      const handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        setEditedTitle(target.value);
      };

      // Stop propagation on keydown to prevent Lexical from capturing keys like backspace
      const handleKeyDown = (e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          saveTitle();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEditingTitle();
        }
      };

      inputRef.addEventListener('input', handleInput);
      inputRef.addEventListener('keydown', handleKeyDown);

      onCleanup(() => {
        inputRef?.removeEventListener('input', handleInput);
        inputRef?.removeEventListener('keydown', handleKeyDown);
      });
    }
  });

  return (
    <PropertiesProvider
      entityType={EntityType.TASK}
      canEdit={true}
      properties={keyProperties}
      onRefresh={() => {}}
      onPropertyAdded={() => {}}
      onPropertyDeleted={() => {}}
      saveHandler={saveHandler}
    >
      <span
        class={cn(
          'inline-task-editor inline-flex flex-1 items-center gap-1 group rounded border border-edge-muted hover:bg-hover/50 align-baseline',
          'mx-1 px-0.5 py-px text-sm max-w-full'
        )}
      >
        {/* Left side: Status Icon + Title */}
        <span class="inline-flex items-center gap-1 min-w-0 flex-1 pointer-events-auto">
          {/* Status Icon - Square variant */}
          <span
            class="shrink-0"
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <Show
              when={statusProperty()}
              fallback={
                <div class="inline-flex items-center justify-center size-6">
                  <StatusCreated class="size-4 text-ink-extra-muted" />
                </div>
              }
            >
              {(prop) => <SquareStatusIcon property={prop()} />}
            </Show>
          </span>

          {/* Task Title - Editable on click */}
          <Show
            when={!isEditingTitle()}
            fallback={
              <input
                ref={inputRef}
                type="text"
                value={editedTitle()}
                onFocusOut={() => saveTitle()}
                class="flex-1 min-w-0 bg-transparent border-none outline-none text-inherit text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <span
              class="truncate cursor-text hover:underline decoration-current/20 underline-offset-2"
              onClick={startEditingTitle}
              data-document-mention="true"
              data-document-id={props.taskId}
              data-block-name="task"
              data-document-name={props.taskName}
            >
              {props.taskName.replaceAll('\n', ' ').trim()}
            </span>
          </Show>
        </span>

        {/* Right side: Priority + Assignees */}
        <span
          class="inline-flex items-center shrink-0 pointer-events-auto"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <For each={otherProperties()}>
            {(property) => <PropertyValue property={property} condensed />}
          </For>
        </span>
      </span>

      <Suspense>
        <Modals />
      </Suspense>
    </PropertiesProvider>
  );
}
