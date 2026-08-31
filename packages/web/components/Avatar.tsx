import type { User } from "@essayist/core";
import { User as UserIcon } from "lucide-preact";

interface AvatarProps {
  user: User;
}

export default function Avatar({ user }: AvatarProps) {
  return (
    <span class="grid place-items-center w-full h-full text-surface overflow-hidden">
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
  );
}
