import { createMemo, Show } from 'solid-js';
import { useEntityProperties } from '@property/hooks';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { PropertyValueIcon } from '@property/component/propertyValue/PropertyValueIcon';
import { EntityIcon } from '@core/component/EntityIcon';

export function TaskStatusIcon(props: { taskId: string }) {
  const { properties, isLoading } = useEntityProperties(
    props.taskId,
    'TASK',
    false
  );

  const statusOptionId = createMemo(() => {
    const p = properties().find(
      (p) => p.propertyDefinitionId === SYSTEM_PROPERTY_IDS.STATUS
    );
    return p?.valueType === 'SELECT_STRING' ? p.value?.[0] : undefined;
  });

  return (
    <Show
      when={!isLoading() && statusOptionId()}
      fallback={<EntityIcon targetType="task" size="xs" />}
    >
      <PropertyValueIcon optionId={statusOptionId()!} class="size-4" />
    </Show>
  );
}
