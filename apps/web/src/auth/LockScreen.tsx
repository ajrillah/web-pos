import { LogOut } from 'lucide-react';
import { errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { BrandMark } from '../components/BrandMark';
import { PinPad } from '../components/PinPad';
import { UserTile } from '../components/UserTile';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useAuth, useCurrentUser } from './AuthProvider';

/** Locked screen: only the same user unlocks; "Ganti pengguna" ends the session. */
export function LockScreen() {
  const user = useCurrentUser();
  const { signedIn, logout } = useAuth();

  async function unlock(pin: string): Promise<string | null> {
    try {
      signedIn((await api.unlock({ pin })).user);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[440px] space-y-4">
        <BrandMark className="justify-center" />
        <Card className="space-y-4 p-7">
          <div className="text-center">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Layar terkunci</h1>
            <p className="text-muted-foreground">Masukkan PIN Anda untuk membuka.</p>
          </div>
          <div className="flex justify-center">
            <UserTile user={user} />
          </div>
          <PinPad onSubmit={unlock} />
          <div className="text-center">
            <Button variant="ghost" onClick={() => void logout()}>
              <LogOut className="size-4" aria-hidden />
              Ganti pengguna
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
