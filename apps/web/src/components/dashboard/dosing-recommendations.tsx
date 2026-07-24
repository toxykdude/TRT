'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Pill,
  Syringe,
  Calendar,
  Activity,
  Info,
  Shield,
  Target,
  Stethoscope,
} from 'lucide-react';
import { resolveCompoundName, resolveDosingField, resolveIndication, resolveNotes } from '@/lib/dosing-i18n';

type DosingRecommendation = {
  compound: string;
  compoundKey: string;
  protocolKey: string;
  dose: string;
  frequency: string;
  route: string;
  cycleLength: string;
  indication: string;
  expectedBiomarkerShift: string;
  ragSourceIds: string[];
  priority: 'clinical_priority' | 'standard' | 'alternative';
  notes?: string;
  indicationParams?: Record<string, string | number>;
};

const priorityConfig = {
  clinical_priority: {
    labelKey: 'labelPriority',
    color: 'destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    icon: Shield,
  },
  standard: {
    labelKey: 'labelStandard',
    color: 'secondary',
    bg: 'bg-secondary/10',
    border: 'border-secondary/30',
    icon: Target,
  },
  alternative: {
    labelKey: 'labelAlternative',
    color: 'outline',
    bg: 'bg-muted/10',
    border: 'border-muted/30',
    icon: Stethoscope,
  },
} as const;

export function DosingRecommendations({ recommendations }: { recommendations: DosingRecommendation[] }) {
  const t = useTranslations('Dosing');
  const compoundsT = useTranslations('Compounds');
  const protocolsT = useTranslations('DosingProtocols');
  const biomarkersT = useTranslations('Biomarkers');
  const categoriesT = useTranslations('Categories');
  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Pill className="h-5 w-5 text-primary" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('desc')}</p>
      </div>

      <div className="space-y-4">
        {recommendations.map((rec, i) => {
          const config = priorityConfig[rec.priority];
          const Icon = config.icon;

          return (
            <Card key={i} className={`${config.bg} border-l-4 ${config.border}`} style={{ borderLeftColor: 'var(--destructive)' }}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-lg">{resolveCompoundName(rec, compoundsT, protocolsT)}</CardTitle>
                      <Badge variant="outline" className={`${config.bg} ${config.border} text-xs`}>
                        <Icon className="mr-1 h-3 w-3" />
                        {t(config.labelKey)}
                      </Badge>
                      {rec.ragSourceIds.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {t('sourcesCount', { count: rec.ragSourceIds.length })}
                        </Badge>
                      )}
                    </div>
                    <CardDescription>{resolveIndication(rec, biomarkersT, categoriesT, protocolsT)}</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Dosing details grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DetailItem icon={Pill} label={t('detailDose')} value={resolveDosingField(rec, 'dose', compoundsT, protocolsT)} />
                  <DetailItem icon={Calendar} label={t('detailFrequency')} value={resolveDosingField(rec, 'frequency', compoundsT, protocolsT)} />
                  <DetailItem icon={Syringe} label={t('detailRoute')} value={resolveDosingField(rec, 'route', compoundsT, protocolsT)} />
                  <DetailItem icon={Activity} label={t('detailCycle')} value={resolveDosingField(rec, 'cycleLength', compoundsT, protocolsT)} />
                </div>

                {/* Expected biomarker shift */}
                <div className="rounded-md border bg-background/50 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">{t('expectedShift')}</span>
                      <p className="text-sm font-medium">{resolveDosingField(rec, 'expectedShift', compoundsT, protocolsT)}</p>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {rec.notes && (
                  <div className="rounded-md border bg-background/30 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm text-muted-foreground">{resolveNotes(rec, protocolsT)}</p>
                    </div>
                  </div>
                )}

                {/* RAG sources */}
                {rec.ragSourceIds.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">{t('sources')}</span>
                    {rec.ragSourceIds.map((source, j) => (
                      <Badge key={j} variant="secondary" className="text-[10px]">
                        {source}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary note */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-6 pb-4">
          <p className="text-xs text-muted-foreground text-center">{t('summaryNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-primary/10 p-2 shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
