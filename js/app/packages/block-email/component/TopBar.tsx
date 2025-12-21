import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import { StaticSplitLabel } from '@app/component/split-layout/components/SplitLabel';
import { SplitToolbarRight } from '@app/component/split-layout/components/SplitToolbar';
import { ENABLE_PROPERTIES_METADATA } from '@core/constant/featureFlags';
import { Show } from 'solid-js';
import { EmailPropertiesModal } from './EmailPropertiesModal';

export function TopBar(props: { title: string }) {
  return (
    <>
      <SplitHeaderLeft>
        <StaticSplitLabel iconType="email" label={props.title} />
      </SplitHeaderLeft>
      <SplitToolbarRight>
        <Show when={ENABLE_PROPERTIES_METADATA}>
          <EmailPropertiesModal buttonSize="sm" subject={props.title} />
        </Show>
      </SplitToolbarRight>
    </>
  );
}
