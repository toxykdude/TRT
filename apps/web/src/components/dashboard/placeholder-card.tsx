import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Honest placeholder for features scaffolded but not built in this pass.
 * Never fakes data — says clearly what exists and what's roadmap (GOLD §11).
 */
export function PlaceholderCard({
  title,
  what,
  next,
}: {
  title: string;
  what: string;
  next: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <Sparkles className="h-6 w-6 text-primary" />
        <h3 className="font-semibold">{title}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{what}</p>
        <p className="max-w-md text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Roadmap:</span> {next}
        </p>
      </CardContent>
    </Card>
  );
}
