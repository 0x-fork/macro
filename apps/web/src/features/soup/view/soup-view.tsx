import type { ListView } from '@app/constants/list-views';
import type { Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  type DefaultListViewId,
  type DefaultListViewProps,
  SoupViewImplementation,
} from './list/default-list-view';
import { AgentsListView, type AgentsListViewProps } from './views/agents';
import {
  CompaniesListView,
  type CompaniesListViewProps,
} from './views/companies';
import {
  DocumentsListView,
  type DocumentsListViewProps,
} from './views/documents';
import { InboxListView, type InboxListViewProps } from './views/inbox';
import { SearchListView, type SearchListViewProps } from './views/search';
import { TasksListView, type TasksListViewProps } from './views/tasks';

export type SoupViewProps =
  | ({ view: DefaultListViewId } & Omit<DefaultListViewProps, 'view'>)
  | ({ view: 'agents' } & AgentsListViewProps)
  | ({ view: 'companies' } & CompaniesListViewProps)
  | ({ view: 'documents' } & DocumentsListViewProps)
  | ({ view: 'inbox' } & InboxListViewProps)
  | ({ view: 'search' } & SearchListViewProps)
  | ({ view: 'tasks' } & TasksListViewProps);

const SPECIALIZED_VIEWS: Partial<Record<ListView, Component<SoupViewProps>>> = {
  agents: AgentsListView as Component<SoupViewProps>,
  companies: CompaniesListView as Component<SoupViewProps>,
  documents: DocumentsListView as Component<SoupViewProps>,
  inbox: InboxListView as Component<SoupViewProps>,
  search: SearchListView as Component<SoupViewProps>,
  tasks: TasksListView as Component<SoupViewProps>,
};

/** Compatibility dispatcher; each specialized entry owns its provider root. */
export function SoupView(props: SoupViewProps) {
  return (
    <Dynamic
      component={
        SPECIALIZED_VIEWS[props.view] ??
        (SoupViewImplementation as Component<SoupViewProps>)
      }
      {...props}
    />
  );
}
