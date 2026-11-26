import { User as UserIcon } from "lucide-preact";

import type { UserData } from "#/state.ts";

interface AvatarProps {
  user: UserData;
}

export default function Avatar({ user }: AvatarProps) {
  return (
    <span class="avatar">
      <span class="avatar-picture">
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name ?? user.email}
            class="block w-full h-full object-cover"
            referrerpolicy="no-referrer"
          />
        ) : (
          <UserIcon size={30} />
        )}
      </span>
    </span>
  );
}
