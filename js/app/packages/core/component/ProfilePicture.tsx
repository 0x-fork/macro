import { ENABLE_PROFILE_PICTURES } from '@core/constant/featureFlags';

import { useProfilePictureUrl } from '@core/signal/profilePicture';
import { idToEmail } from '@core/user';
import { createMemo, Show } from 'solid-js';
import type { SizeClass } from './UserIcon';

type ProfilePictureProps = {
  id?: string;
  sizeClass: SizeClass;
  email?: string;
  // TODO: remove. Not being used.
  imageUrl?: string;
  fetchUrl?: boolean;
};

/**
 * ProfilePicture renders a profile picture for a user.
 *
 * @deprecated Use the Avatar component instead.
 */
export function ProfilePicture(props: ProfilePictureProps) {
  const email = createMemo(() => {
    const id = props.id;
    if (!id) {
      return props.email || 'User';
    }

    return idToEmail(id);
  });

  if (!ENABLE_PROFILE_PICTURES) {
    return (
      <div class={`flex-shrink-0 ${props.sizeClass.text}`}>
        {email().substring(0, 1).toUpperCase()}
      </div>
    );
  }

  const [profilePicUrl] = useProfilePictureUrl(props.id);
  return (
    <Show
      when={profilePicUrl()}
      fallback={
        <div
          class={`shrink-0 ${props.sizeClass.container} flex items-center justify-center`}
          style={{
            'line-height': 0,
          }}
        >
          <span class={props.sizeClass.text}>
            {email().substring(0, 1).toUpperCase()}
          </span>
        </div>
      }
      keyed
    >
      {(url) => (
        <div
          class={`${props.sizeClass.container} flex-shrink-0 overflow-hidden rounded-full`}
        >
          <img
            src={url}
            class="object-cover rounded-full w-full h-full origin-[50%_20%]"
          />
        </div>
      )}
    </Show>
  );
}
