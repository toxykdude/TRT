/**
 * Presentation-layer resolvers for dosing recommendations.
 *
 * Engines emit stable machine keys (`compoundKey`, `protocolKey`); the UI maps
 * them to localized strings via the `Compounds` and `DosingProtocols` next-intl
 * namespaces. The deterministic engine prose/hash is never touched — this is a
 * pure display concern.
 *
 * Why protocol overrides: dose/frequency/route/cycleLength/expectedShift are
 * PROTOCOL-SPECIFIC in the dosing engine. A few protocols override the compound
 * defaults (e.g. high-hematocrit uses a lower conditional dose; low-estradiol and
 * high-SHBG use bespoke doses). Rendering by `compoundKey` alone would show the
 * wrong (default) dose — a clinical-safety issue (GOLD §1). So protocol-specific
 * values win when present, falling back to the compound canonical default.
 *
 * Backward compatibility: older reports persisted before these keys existed do
 * not carry `protocolKey`/`compoundKey`/`indicationParams`. Every resolver guards
 * with `.has` and ultimately falls back to the raw engine string, so viewing a
 * legacy report never crashes (it simply renders the original English value).
 */
export type DosingRecLike = {
  compound: string;
  compoundKey: string;
  protocolKey: string;
  dose?: string;
  frequency?: string;
  route?: string;
  cycleLength?: string;
  expectedBiomarkerShift?: string;
  indication?: string;
  notes?: string;
  indicationParams?: Record<string, string | number>;
};

/**
 * Minimal translator shape compatible with next-intl's `useTranslations` /
 * `getTranslations` return value (a callable that also exposes `.has`).
 */
export type Translator = {
  (path: string, values?: Record<string, string | number>): string;
  has(path: string): boolean;
};

type DosingField = 'dose' | 'frequency' | 'route' | 'cycleLength' | 'expectedShift';

/** Raw engine property name for each rendered field (expectedShift ≠ expectedBiomarkerShift). */
function rawField(rec: DosingRecLike, field: DosingField): string {
  switch (field) {
    case 'dose':
      return rec.dose ?? '';
    case 'frequency':
      return rec.frequency ?? '';
    case 'route':
      return rec.route ?? '';
    case 'cycleLength':
      return rec.cycleLength ?? '';
    case 'expectedShift':
      return rec.expectedBiomarkerShift ?? '';
  }
}

/**
 * Resolve a protocol-specific dosing field, falling back to the compound default,
 * then to the raw engine value (for legacy reports without keys).
 */
export function resolveDosingField(
  rec: DosingRecLike,
  field: DosingField,
  compoundsT: Translator,
  protocolsT: Translator,
): string {
  const protoPath = `${rec.protocolKey}.${field}`;
  if (rec.protocolKey && protocolsT.has(protoPath)) {
    return protocolsT(protoPath, rec.indicationParams ?? {});
  }
  const compoundPath = `${rec.compoundKey}.${field}`;
  if (rec.compoundKey && compoundsT.has(compoundPath)) {
    return compoundsT(compoundPath);
  }
  return rawField(rec, field);
}

/** Resolve the compound display name (falls back to protocol name, then raw). */
export function resolveCompoundName(
  rec: DosingRecLike,
  compoundsT: Translator,
  protocolsT: Translator,
): string {
  const compoundPath = `${rec.compoundKey}.name`;
  if (rec.compoundKey && compoundsT.has(compoundPath)) return compoundsT(compoundPath);
  const protoPath = `${rec.protocolKey}.name`;
  if (rec.protocolKey && protocolsT.has(protoPath)) return protocolsT(protoPath);
  return rec.compound;
}

/**
 * Resolve the localized clinician notes. Uses an ICU lookup when the protocol
 * defines notes (some branches are `{select}` on `indicationParams.noteKey`),
 * otherwise falls back to the raw engine notes (legacy reports).
 */
export function resolveNotes(rec: DosingRecLike, protocolsT: Translator): string {
  const path = `${rec.protocolKey}.notes`;
  if (rec.protocolKey && protocolsT.has(path)) {
    return protocolsT(path, rec.indicationParams ?? {});
  }
  return rec.notes ?? '';
}

type PanelGroup = { category: string; keys: string[] };

/**
 * Resolve the localized indication string. Most protocols use a straight ICU
 * lookup with `indicationParams`. The `panel_completion` protocol is special:
 * its `indicationParams.panels` is a JSON string of `{ category, keys[] }`
 * groups (engine-built, locale-neutral). We parse it and localize each category
 * (Categories namespace) and biomarker key (Biomarkers namespace, with fallback)
 * before interpolating, so the missing-panel list renders in the active locale.
 */
export function resolveIndication(
  rec: DosingRecLike,
  biomarkersT: Translator,
  categoriesT: Translator,
  protocolsT: Translator,
): string {
  if (!rec.protocolKey) return rec.indication ?? '';
  if (rec.protocolKey === 'panel_completion') {
    const raw = rec.indicationParams?.panels;
    let groups: PanelGroup[] = [];
    if (typeof raw === 'string' && raw.length > 0) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          groups = parsed.filter(
            (g): g is PanelGroup =>
              g != null &&
              typeof g === 'object' &&
              typeof (g as PanelGroup).category === 'string' &&
              Array.isArray((g as PanelGroup).keys),
          );
        }
      } catch {
        groups = [];
      }
    }
    const panels = groups
      .map((g) => {
        const cat = categoriesT.has(g.category) ? categoriesT(g.category) : g.category;
        const keys = g.keys.map((k) => (biomarkersT.has(k) ? biomarkersT(k) : k)).join(', ');
        return `${cat}: ${keys}`;
      })
      .join('; ');
    return protocolsT('panel_completion.indication', { panels });
  }
  return protocolsT(`${rec.protocolKey}.indication`, rec.indicationParams ?? {});
}
