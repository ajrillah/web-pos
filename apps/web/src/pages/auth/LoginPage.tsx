import type { LoginUser } from '@toko-podomoro/shared';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { BrandMark } from '../../components/BrandMark';
import { ErrorAlert } from '../../components/forms';
import { PinPad } from '../../components/PinPad';
import { UserTile } from '../../components/UserTile';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

/** Login: pick your tile, then type the 6-digit PIN (on the pad or the keyboard). */
export function LoginPage() {
  const { signedIn } = useAuth();
  const [users, setUsers] = useState<LoginUser[] | null>(null);
  const [chosen, setChosen] = useState<LoginUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .loginUsers()
      .then((r) => {
        setUsers(r.users);
        // One user: skip the tiles.
        if (r.users.length === 1) setChosen(r.users[0] ?? null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  async function login(pin: string): Promise<string | null> {
    if (!chosen) return null;
    try {
      signedIn((await api.login({ userId: chosen.id, pin })).user);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[720px] space-y-6">
        <BrandMark className="justify-center" />
        <Card className="space-y-6 p-8">
          <div className="text-center">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
              {chosen ? `Halo, ${chosen.name}` : 'Siapa yang bertugas?'}
            </h1>
            <p className="text-muted-foreground">
              {chosen ? 'Masukkan PIN 6 angka.' : 'Pilih nama Anda.'}
            </p>
          </div>
          <ErrorAlert message={error} />
          {chosen ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <UserTile user={chosen} />
              </div>
              <PinPad key={chosen.id} onSubmit={login} />
              {users && users.length > 1 && (
                <div className="text-center">
                  <Button variant="ghost" onClick={() => setChosen(null)}>
                    <ArrowLeft className="size-4" aria-hidden />
                    Pilih pengguna lain
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-4">
              {users?.map((user) => (
                <UserTile key={user.id} user={user} onClick={() => setChosen(user)} />
              ))}
            </div>
          )}
          <p className="text-center text-sm">
            <Link
              to="/pulihkan-pin"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Pemilik lupa PIN?
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
