import { EntityIcon } from '@core/component/EntityIcon';
import type { CrmCompanyEntity } from '@entity';
import { Show } from 'solid-js';

export function CompanyHeader(props: { company?: CrmCompanyEntity }) {
  return (
    <div class="flex items-start gap-3">
      <div class="size-10 shrink-0">
        <EntityIcon targetType="crm_company" size="fill" />
      </div>
      <div class="flex min-w-0 flex-col gap-1">
        <h1 class="truncate text-xl font-semibold">
          {props.company?.name ?? 'Company'}
        </h1>
        <Show when={props.company?.description}>
          {(description) => (
            <p class="text-sm text-ink-muted">{description()}</p>
          )}
        </Show>
      </div>
    </div>
  );
}
