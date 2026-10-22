import { useAuth } from '../../auth/AuthProvider';
import { Card } from '../../components/ui/card';
import { PageHeader } from '../../layout/PageHeader';
import { ChangePinForm } from '../auth/ChangePinForm';

export function ChangePinPage() {
  const { signedIn } = useAuth();
  return (
    <section className="max-w-md">
      <PageHeader title="Ubah PIN" description="PIN dipakai untuk masuk dan membuka kunci layar." />
      <Card className="p-7">
        <ChangePinForm onDone={signedIn} />
      </Card>
    </section>
  );
}
