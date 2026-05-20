import { SplitDrawer } from '@app/component/split-layout/components/SplitDrawer';
import { useDrawerControl } from '@app/component/split-layout/components/SplitDrawerContext';
import clickOutside from '@core/directive/clickOutside';
import Quotes from '@phosphor/quotes.svg';
import type { ItemType } from '@service-storage/client';
import { Button } from '@ui';
import { Suspense } from 'solid-js';
import { References } from './References';

false && clickOutside;
export const REFERENCES_DRAWER_ID = 'references';

export function ReferencesButton(props: {
  documentId: string;
  documentName?: string;
  entityType?: ItemType;
  buttonSize?: 'sm';
  onOpenChange?: (open: boolean) => void;
}) {
  const drawerControl = useDrawerControl(REFERENCES_DRAWER_ID);
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={() => {
        props.onOpenChange?.(!drawerControl.isOpen());
        drawerControl.toggle();
      }}
    >
      <Quotes />
    </Button>
  );
}

export function ReferencesDrawer(props: {
  documentId: string;
  documentName?: string;
  entityType?: ItemType;
}) {
  const title = () => {
    if (!props.documentName) return 'References';
    return (
      <>
        References
        <span class="text-ink-extra-muted">
          {' - '}
          {props.documentName}
        </span>
      </>
    );
  };
  return (
    <SplitDrawer
      id={REFERENCES_DRAWER_ID}
      side="right"
      size={768}
      title={title()}
    >
      <Suspense
        fallback={
          <div class="flex justify-center py-8">
            <div class="animate-spin rounded-full size-6 border-b-2 border-ink-muted"></div>
          </div>
        }
      >
        <References
          documentId={props.documentId}
          entityType={props.entityType}
        />
      </Suspense>
    </SplitDrawer>
  );
}
