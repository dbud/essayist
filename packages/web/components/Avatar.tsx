import type { User } from "@essayist/core";
import { User as UserIcon } from "lucide-preact";

interface AvatarProps {
  user: User;
}

export default function Avatar({ user }: AvatarProps) {
  return user.picture ? (
    <img
      src={user.picture}
      alt={user.name ?? user.email}
      class="w-full h-full rounded-full object-cover shrink-0"
      referrerpolicy="no-referrer"
    />
  ) : (
    <span class="grid place-items-center w-full h-full rounded-full bg-base-300 shrink-0">
      <UserIcon size={16} />
    </span>
  );
}
