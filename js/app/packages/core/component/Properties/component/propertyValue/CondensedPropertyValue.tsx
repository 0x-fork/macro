import { getSelectValues } from '@core/component/Properties/utils';
import { PropertyValueIcon } from './PropertyValueIcon';
import { Tooltip } from '@core/component/Tooltip';
import type { Component, JSX } from 'solid-js';
import { Show } from 'solid-js';
import type { Property } from '../../types';
import {
  hasValue,
  isSelectProperty,
  isEntityProperty,
  isDateProperty,
  isStringProperty,
  isNumberProperty,
  isBooleanProperty,
} from '../../utils/typeGuards';
import {
  formatDate,
  formatNumber,
  formatBoolean,
} from '../../utils/formatting';
import { PropertyTooltip } from './PropertyTooltip';
import CircleDashedEmpty from '@icon/regular/circle-dashed.svg';
import { UserGroup } from './UserGroup';
import { cn } from '@ui/utils/classname';

type CondensedPropertyValueProps = {
  property: Property;
  canEdit: boolean;
  onEdit?: (property: Property, anchor?: HTMLElement) => void;
};

/**
 * Condensed property value display - shows as an icon-only pill but launches full modals for editing
 * Similar to PropertyPills but integrated with the Properties context for editing
 */
export const CondensedPropertyValue: Component<CondensedPropertyValueProps> = (
  props
) => {
  const validValue = () => hasValue(props.property);

  const handleClick = (e: MouseEvent) => {
    if (!props.canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    props.onEdit?.(props.property, target);
  };

  return (
    <Tooltip
      unstyled
      tooltip={<PropertyTooltip property={props.property} />}
      class="flex items-center"
    >
      <div
        class={cn(
          'inline-flex items-center text-xs leading-none text-ink-muted shrink-0 py-1.5 h-6.5 transition-colors px-1.5',
          {
            'hover:border-edge-muted hover:bg-hover/50': props.canEdit,
            'opacity-50': !validValue(),
          }
        )}
        onClick={handleClick}
        role={props.canEdit ? 'button' : undefined}
        tabIndex={props.canEdit ? 0 : undefined}
      >
        <CondensedIcon property={props.property} />
      </div>
    </Tooltip>
  );
};

const CondensedIcon = (props: { property: Property }): JSX.Element => {
  const valid = () => hasValue(props.property);

  // Select properties - derive optionId reactively for animation
  const selectOptionId = () => {
    if (!valid() || !isSelectProperty(props.property)) return null;
    const values = getSelectValues(props.property);
    return values[0] ?? null;
  };

  // Entity properties
  const entityContent = () => {
    if (!valid() || !isEntityProperty(props.property)) return null;
    if (props.property.specificEntityType === 'USER') {
      return { type: 'user' as const, value: props.property.value ?? [] };
    }
    const count = props.property.value?.length ?? 0;
    if (count > 0) {
      return { type: 'count' as const, value: count };
    }
    return null;
  };

  // Date properties
  const dateValue = () => {
    if (!valid() || !isDateProperty(props.property)) return null;
    return props.property.value ?? null;
  };

  // String properties
  const stringValue = () => {
    if (!valid() || !isStringProperty(props.property)) return null;
    return props.property.value ?? null;
  };

  // Number properties
  const numberValue = () => {
    if (!valid() || !isNumberProperty(props.property)) return null;
    return props.property.value;
  };

  // Boolean properties
  const booleanValue = () => {
    if (!valid() || !isBooleanProperty(props.property)) return null;
    return props.property.value;
  };

  const hasAnyValue = () =>
    selectOptionId() !== null ||
    entityContent() !== null ||
    dateValue() !== null ||
    stringValue() !== null ||
    numberValue() !== null ||
    booleanValue() !== null;

  return (
    <Show
      when={hasAnyValue()}
      fallback={<CircleDashedEmpty class="size-3 shrink-0" />}
    >
      {/* Select properties - PropertyValueIcon stays mounted for animation */}
      <Show when={selectOptionId()}>
        {(optionId) => <PropertyValueIcon optionId={optionId()} />}
      </Show>

      {/* Entity properties */}
      <Show when={entityContent()}>
        {(content) => (
          <Show
            when={content().type === 'user'}
            fallback={
              <span class="truncate max-w-[100px]">
                {content().value === 1 ? '1 item' : `${content().value} items`}
              </span>
            }
          >
            <UserGroup entities={content().value as any} maxUsers={2} />
          </Show>
        )}
      </Show>

      {/* Date properties */}
      <Show when={dateValue()}>
        {(value) => (
          <span class="truncate max-w-[100px]">{formatDate(value())}</span>
        )}
      </Show>

      {/* String properties */}
      <Show when={stringValue()}>
        {(value) => <span class="truncate max-w-[100px]">{value()}</span>}
      </Show>

      {/* Number properties */}
      <Show when={numberValue() !== null && numberValue() !== undefined}>
        <span class="truncate max-w-[100px]">{formatNumber(numberValue()!)}</span>
      </Show>

      {/* Boolean properties */}
      <Show when={booleanValue() !== null && booleanValue() !== undefined}>
        <span class="truncate max-w-[100px]">{formatBoolean(booleanValue()!)}</span>
      </Show>
    </Show>
  );
};
