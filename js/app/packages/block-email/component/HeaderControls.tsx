import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import {
  SplitHeaderBadge,
  StaticSplitLabel,
} from '@app/component/split-layout/components/SplitLabel';
import { hasPermissions, Permissions } from '@core/component/SharePermissions';
import { ShareButton } from '@core/component/TopBar/ShareButton';
import { ENABLE_EMAIL_SHARING } from '@core/constant/featureFlags';
import { Show } from 'solid-js';
import { useEmailContext } from './EmailContext';
import { EmailPropertiesModal } from './EmailPropertiesModal';

export function HeaderControls(props: {
  id: string;
  title: string;
  isDraft?: boolean;
}) {
  const email = useEmailContext();

  return (
    <>
      <SplitHeaderLeft>
        <div class="flex items-center gap-2 min-w-0">
          <StaticSplitLabel
            iconType="email"
            label={props.title}
            badges={
              props.isDraft
                ? [
                    <SplitHeaderBadge
                      text="draft"
                      tooltip="This is a Draft Email"
                    />,
                  ]
                : undefined
            }
          />
          <div class="flex items-center gap-2 shrink-0">
            <EmailPropertiesModal
              buttonSize="sm"
              subject={props.title}
              canEdit={hasPermissions(
                email.permissions().type,
                Permissions.CAN_EDIT
              )}
            />
            <Show when={ENABLE_EMAIL_SHARING}>
              <ShareButton
                id={props.id}
                name={props.title}
                itemType="email"
                userPermissions={email.permissions().type}
              />
            </Show>
          </div>
        </div>
      </SplitHeaderLeft>
    </>
  );
}
