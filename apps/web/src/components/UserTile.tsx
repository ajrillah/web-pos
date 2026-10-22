import type { LoginUser } from '@toko-podomoro/shared';
import { cn } from '../lib/utils';
import { roleLabels } from '../navigation/menu';

/** Avatar initial, name, and role; used on the login tiles and the lock screen. */
export function UserTile({
  user,
  selected = false,
  onClick,
  className,
}: {
  user: LoginUser;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-2xl font-bold text-primary">
        {user.name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="text-center leading-tight">
        <span className="block font-semibold">{user.name}</span>
        <span className="block text-sm text-muted-foreground">{roleLabels[user.role]}</span>
      </span>
    </>
  );
  const classes = cn(
    'flex w-36 flex-col items-center gap-2.5 rounded-card bg-card p-4 shadow-card',
    selected && 'ring-2 ring-primary',
    className,
  );
  return onClick ? (
    <button
      type="button"
      data-user-tile={user.name}
      onClick={onClick}
      className={cn(
        classes,
        'outline-none hover:bg-selected focus-visible:ring-[3px] focus-visible:ring-primary-soft',
      )}
    >
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
}
