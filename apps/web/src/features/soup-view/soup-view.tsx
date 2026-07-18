import type { ListView } from '@app/constants/list-views';
import type { Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  type DefaultListViewId,
  type DefaultListViewProps,
  SoupViewImplementation,
} from './list-views/default-list-view';
import {
  CompaniesListView,
  type CompaniesListViewProps,
} from './list-views/views/companies';
import {
  DocumentsListView,
  type DocumentsListViewProps,
} from './list-views/views/documents';
import {
  InboxListView,
  type InboxListViewProps,
} from './list-views/views/inbox';
import {
  SearchListView,
  type SearchListViewProps,
} from './list-views/views/search';
import {
  TasksListView,
  type TasksListViewProps,
} from './list-views/views/tasks';

export type SoupViewProps =
  | ({ view: DefaultListViewId } & Omit<DefaultListViewProps, 'view'>)
  | ({ view: 'companies' } & CompaniesListViewProps)
  | ({ view: 'documents' } & DocumentsListViewProps)
  | ({ view: 'inbox' } & InboxListViewProps)
  | ({ view: 'search' } & SearchListViewProps)
  | ({ view: 'tasks' } & TasksListViewProps);

const SPECIALIZED_VIEWS: Partial<Record<ListView, Component<SoupViewProps>>> = {
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
