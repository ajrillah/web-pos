import { Construction } from 'lucide-react';
import { Card } from '../components/ui/card';
import { PageHeader } from '../layout/PageHeader';

/** Page whose feature is scheduled for a later roadmap stage. */
export function ComingSoonPage({ title, stage }: { title: string; stage: number }) {
  return (
    <section>
      <PageHeader title={title} />
      <Card className="flex items-center gap-4 p-6">
        <Construction className="size-6 text-faint" aria-hidden />
        <p className="text-muted-foreground">Fitur ini sedang dikembangkan (tahap {stage}).</p>
      </Card>
    </section>
  );
}
