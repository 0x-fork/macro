import { useNavigate } from '@app/lib/split-router';
import { externalRoute } from '@app/routes/routes';
import { SidePanel } from '@components/app/side-panel';
import {
  useSplitDisplayName,
  useSplitPanel,
} from '@components/app/split-layout/layoutUtils';
import { getPermissions } from '@core/component/SharePermissions';
import { ShareTrigger } from '@core/component/TopBar/ShareButton';
import { useShareModal } from '@core/component/TopBar/shareModal';
import { useUserId } from '@core/context/user';
import type { JSX } from 'solid-js';
import { WhatsAppGroupProvider } from './context/whatsapp-group-context';
import { createWhatsAppGroupCapabilities } from './queries/capabilities';
import { whatsappGroupApi } from './queries/production-api';
import { WhatsAppGroupView } from './views/whatsapp-group-view';

export function WhatsAppGroup(props: {
  groupId: string;
  /** Header control before the title; defaults to closing the split. */
  leading?: JSX.Element;
}) {
  const userId = useUserId();
  const panel = useSplitPanel();
  const navigate = useNavigate();
  const source = createWhatsAppGroupCapabilities(
    whatsappGroupApi,
    () => userId() ?? '',
    () => props.groupId
  );
  useSplitDisplayName(() => source.group.data?.name ?? 'WhatsApp chat');
  const share = useShareModal(() => {
    const group = source.group.data;
    if (!group) return;
    return {
      id: props.groupId,
      itemType: 'whatsapp_group',
      blockAlias: 'whatsapp_group',
      name: group.name,
      owner: group.ownerId,
      userPermissions: getPermissions(group.accessLevel),
    };
  });
  return (
    <WhatsAppGroupProvider value={source}>
      {/* Like an in-view email thread: the details panel floats over the
          conversation and starts closed. */}
      <SidePanel.Root floating defaultOpen={false}>
        <WhatsAppGroupView
          leading={props.leading}
          userId={userId()}
          share={
            <ShareTrigger
              onClick={share}
              id={props.groupId}
              blockType="whatsapp_group"
              hotkeyScope={panel?.splitHotkeyScope}
            />
          }
          onShare={share}
          onConnect={() => navigate({ route: externalRoute, params: {} })}
        />
      </SidePanel.Root>
    </WhatsAppGroupProvider>
  );
}
