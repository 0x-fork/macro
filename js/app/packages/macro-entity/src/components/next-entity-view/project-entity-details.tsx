import { Tooltip } from '@core/component/Tooltip';
import type { EntityClickHandler, ProjectEntity } from '@macro-entity';
import {
  createDeferred,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  Suspense,
} from 'solid-js';
import {
  createProjectQuery,
  type ProjectContainedEntity,
} from '../../queries/project';
import type { EntityClickEvent } from '../Entity';

export function ProjectEntityDetails(props: {
  entity: ProjectContainedEntity;
  onClick?: EntityClickHandler<ProjectEntity>;
}) {
  const projectQuery = createProjectQuery(props.entity);
  let projectIconRef!: HTMLDivElement;

  createEffect(() => {
    const click = props.onClick;
    if (!click) return;
    if (!projectQuery.isSuccess) return;

    const data = projectQuery.data;
    const handleClick = (e: EntityClickEvent) => {
      const projectEntity: ProjectEntity = {
        type: 'project',
        id: data.id,
        name: data.name,
        ownerId: data.owner,
        updatedAt: data.updatedAt,
      };
      click(projectEntity, e, undefined, { ignorePreview: true });
    };

    projectIconRef.classList.add('hover:text-accent');
    projectIconRef.dataset.blocksNavigation = 'true';
    projectIconRef.addEventListener('click', handleClick);
    onCleanup(() => {
      projectIconRef.removeEventListener('click', handleClick);
    });
  });

  return (
    <div
      ref={projectIconRef}
      class="flex gap-1 items-center text-xs text-ink-extra-muted min-w-0"
    >
      <svg
        class="shrink-0"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 18 18"
        fill="none"
      >
        <path
          d="M15.1875 5.0625H9.18773L7.23727 3.6C7.04225 3.45449 6.80558 3.3756 6.56227 3.375H2.8125C2.51413 3.375 2.22798 3.49353 2.017 3.7045C1.80603 3.91548 1.6875 4.20163 1.6875 4.5V14.0625C1.6875 14.3609 1.80603 14.647 2.017 14.858C2.22798 15.069 2.51413 15.1875 2.8125 15.1875H15.2501C15.5317 15.1871 15.8018 15.0751 16.0009 14.8759C16.2001 14.6768 16.3121 14.4067 16.3125 14.1251V6.1875C16.3125 5.88913 16.194 5.60298 15.983 5.392C15.772 5.18103 15.4859 5.0625 15.1875 5.0625ZM15.1875 14.0625H2.8125V4.5H6.56227L8.6625 6.075C8.75987 6.14803 8.87829 6.1875 9 6.1875H15.1875V14.0625Z"
          fill="currentColor"
        />
      </svg>
      <Suspense
        fallback={<div class="h-3 w-10 bg-ink-placeholder animate-pulse" />}
      >
        <Show when={projectQuery.data}>
          {(data) => (
            <EntityProjectPathDisplay name={data().name} path={data().path} />
          )}
        </Show>
      </Suspense>
    </div>
  );
}

function EntityProjectPathDisplay(props: { name: string; path: string[] }) {
  const [displayPath, setDisplayPath] = createSignal<string | undefined>(
    props.name
  );
  const [truncated, setTruncated] = createSignal(false);

  const fullPath = createMemo(() => props.path.join(' / '));

  const getDisplayPath = (): { name: string; truncated: boolean } => {
    const fullPathString = fullPath();
    const maxLength = 30;

    if (fullPathString.length <= maxLength) {
      return { name: fullPathString, truncated: false };
    }

    if (props.path.length === 1) {
      return {
        name: props.path[0].slice(0, maxLength - 3) + '...',
        truncated: true,
      };
    }

    if (props.path.length === 2) {
      const first = props.path[0];
      const last = props.path[props.path.length - 1];
      const combined = `${first} / ... / ${last}`;
      if (combined.length <= maxLength) {
        return { name: combined, truncated: true };
      }
      return {
        name: `${first.slice(0, 10)}... / ${last.slice(0, 10)}...`,
        truncated: true,
      };
    }

    const first = props.path[0];
    const last = props.path[props.path.length - 1];
    return { name: `${first} / ... / ${last}`, truncated: true };
  };

  createDeferred(() => {
    const { name, truncated } = getDisplayPath();
    setDisplayPath(name);
    setTruncated(truncated);
  });

  return (
    <Tooltip tooltip={fullPath()} hide={!truncated()}>
      <div class="truncate">{displayPath()}</div>
    </Tooltip>
  );
}
