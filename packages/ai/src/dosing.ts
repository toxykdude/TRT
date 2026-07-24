/**
 * Dosing recommendation engine — generates exact steroid + ancillary dosages
 * from deterministic engine findings + KB/graph enrichment.
 *
 * This is a lightweight rule-based engine (no AI model in the loop) that
 * matches patient biomarker patterns to clinical protocols. It is deterministic:
 * same inputs always produce the same dosing recommendations.
 *
 * Each recommendation includes `rag_source_ids` referencing KB passages and
 * graph facts that support the dosing decision.
 *
 * Protocol coverage:
 *   - Base TRT (low total testosterone)
 *   - Estradiol management (high/low e2)
 *   - Hematocrit management (high HCT)
 *   - SHBG management (high SHBG → free T issues)
 *   - PCT (post-cycle or off-TRT)
 *   - Nandrolone for body comp
 *   - Trenbolone for cutting
 *   - Boldenone for lean gains
 *   - Oral priming (Dianabol/Oxandrolone)
 *
 * GOLD §2: dosages are recommendations, not prescriptions. The physician
 * validates every recommendation.
 */

import type { ClassifiedResult, Trend, Finding, CoverageGap } from '@trt/engine';

// ── Output types ──────────────────────────────────────────────────────────────

export type DosingRecommendation = {
  /** compound name (display) */
  compound: string;
  /** compound key for internal matching */
  compoundKey: string;
  /** recommended dose with unit, e.g. "200 mg" */
  dose: string;
  /** frequency, e.g. "weekly", "every 3 days" */
  frequency: string;
  /** route: intramuscular, oral, subcutaneous, transdermal */
  route: string;
  /** expected cycle length */
  cycleLength: string;
  /** what biomarker pattern triggered this recommendation */
  indication: string;
  /** expected biomarker shift (e.g. "+150 ng/dL total testosterone") */
  expectedBiomarkerShift: string;
  /** RAG source IDs supporting this recommendation */
  ragSourceIds: string[];
  /** severity: optional, clinical_priority, standard, alternative */
  priority: 'clinical_priority' | 'standard' | 'alternative';
  /** notes for the clinician */
  notes?: string;
  /** ancillary support (AIs, hCG, SERMs) recommended alongside this compound */
  ancillarySupport?: AncillarySupport[];
  /**
   * Stable protocol identifier (presentation-layer i18n hook). The UI maps this
   * key to localized indication/notes (and protocol-specific dosing overrides)
   * via the `DosingProtocols` next-intl namespace. Additive only; does NOT enter
   * the deterministic report hash (dosing is excluded from the hash).
   */
  protocolKey: string;
  /**
   * Optional ICU interpolation values for the localized indication/notes/dose.
   * The UI passes these to `DosingProtocols.{protocolKey}.*` messages. Typical
   * keys: `value` (biomarker reading), `noteKey` (select branch for conditional
   * notes/dose), `panels` (JSON string of missing-panel groups). Additive only.
   */
  indicationParams?: Record<string, string | number>;
};

export type AncillarySupport = {
  compound: string;
  dose: string;
  frequency: string;
  route: string;
  reason: string;
  ragSourceIds: string[];
};

// ── Compound database ─────────────────────────────────────────────────────────

type CompoundDef = {
  name: string;
  key: string;
  defaultDose: string;
  defaultFrequency: string;
  defaultRoute: string;
  defaultCycleLength: string;
  expectedShift: string;
  category: 'trt_base' | 'trt_alternative' | 'bulk' | 'cut' | 'lean' | 'priming' | 'ancillary';
};

const COMPOUNDS: CompoundDef[] = [
  // TRT bases
  {
    name: 'Testosterone Cypionate',
    key: 'testosterone_cypionate',
    defaultDose: '100–200 mg',
    defaultFrequency: 'every 7 days',
    defaultRoute: 'intramuscular',
    defaultCycleLength: 'ongoing (12+ week assessment)',
    expectedShift: '+150–300 ng/dL total testosterone',
    category: 'trt_base',
  },
  {
    name: 'Testosterone Enanthate',
    key: 'testosterone_enanthate',
    defaultDose: '100–200 mg',
    defaultFrequency: 'every 7 days',
    defaultRoute: 'intramuscular',
    defaultCycleLength: 'ongoing (12+ week assessment)',
    expectedShift: '+150–300 ng/dL total testosterone',
    category: 'trt_base',
  },
  {
    name: 'Testosterone Propionate',
    key: 'testosterone_propionate',
    defaultDose: '50–100 mg',
    defaultFrequency: 'every 3–4 days',
    defaultRoute: 'intramuscular',
    defaultCycleLength: 'ongoing (12+ week assessment)',
    expectedShift: '+100–200 ng/dL total testosterone',
    category: 'trt_base',
  },
  // Alternatives
  {
    name: 'Nandrolone Decanoate',
    key: 'nandrolone_decanoate',
    defaultDose: '100–200 mg',
    defaultFrequency: 'every 10–14 days',
    defaultRoute: 'intramuscular',
    defaultCycleLength: '12–16 weeks',
    expectedShift: '+50–100 ng/dL testosterone, improved body comp',
    category: 'bulk',
  },
  {
    name: 'Trenbolone Acetate',
    key: 'trenbolone_acetate',
    defaultDose: '50–100 mg',
    defaultFrequency: 'every other day',
    defaultRoute: 'intramuscular',
    defaultCycleLength: '8–12 weeks',
    expectedShift: '+100–200 ng/dL testosterone, fat loss + muscle retention',
    category: 'cut',
  },
  {
    name: 'Boldenone Undecylenate',
    key: 'boldenone_undecylenate',
    defaultDose: '200–400 mg',
    defaultFrequency: 'every 10–14 days',
    defaultRoute: 'intramuscular',
    defaultCycleLength: '10–14 weeks',
    expectedShift: '+100–200 ng/dL testosterone, lean mass gains',
    category: 'lean',
  },
  {
    name: 'Masteron Propionate',
    key: 'masteron_propionate',
    defaultDose: '50–100 mg',
    defaultFrequency: 'every other day',
    defaultRoute: 'intramuscular',
    defaultCycleLength: '8–10 weeks',
    expectedShift: 'anti-estrogenic, improved muscle hardness',
    category: 'cut',
  },
  {
    name: 'Primobolan (Methenolone Enanthate)',
    key: 'primobolan_enanthate',
    defaultDose: '100–200 mg',
    defaultFrequency: 'every 7–10 days',
    defaultRoute: 'intramuscular',
    defaultCycleLength: '8–12 weeks',
    expectedShift: 'lean mass preservation, low androgenic side effects',
    category: 'lean',
  },
  {
    name: 'Oxandrolone',
    key: 'oxandrolone',
    defaultDose: '20–50 mg',
    defaultFrequency: 'daily (split AM/PM)',
    defaultRoute: 'oral',
    defaultCycleLength: '6–8 weeks',
    expectedShift: '+5–10% lean mass, fat loss, strength gains',
    category: 'priming',
  },
  {
    name: 'Dianabol (Methandienone)',
    key: 'dianabol',
    defaultDose: '20–40 mg',
    defaultFrequency: 'daily (split AM/PM)',
    defaultRoute: 'oral',
    defaultCycleLength: '4–6 weeks',
    expectedShift: 'rapid strength + mass gains, water retention',
    category: 'priming',
  },
  // Ancillaries
  {
    name: 'Anastrozole',
    key: 'anastrozole',
    defaultDose: '0.25–0.5 mg',
    defaultFrequency: 'every 3–4 days or as needed',
    defaultRoute: 'oral',
    defaultCycleLength: 'ongoing with TRT',
    expectedShift: '↓ estradiol by 20–50 pg/mL',
    category: 'ancillary',
  },
  {
    name: 'Letrozole',
    key: 'letrozole',
    defaultDose: '0.25–0.5 mg',
    defaultFrequency: 'every 3–4 days or as needed',
    defaultRoute: 'oral',
    defaultCycleLength: 'ongoing with TRT',
    expectedShift: '↓ estradiol by 30–60 pg/mL (more potent than AI)',
    category: 'ancillary',
  },
  {
    name: 'Exemestane',
    key: 'exemestane',
    defaultDose: '12.5 mg',
    defaultFrequency: '2–3x per week',
    defaultRoute: 'oral',
    defaultCycleLength: 'ongoing with TRT',
    expectedShift: '↓ estradiol by 20–40 pg/mL (steroidal AI)',
    category: 'ancillary',
  },
  {
    name: 'hCG (Human Chorionic Gonadotropin)',
    key: 'hcg',
    defaultDose: '250–500 IU',
    defaultFrequency: '2–3x per week',
    defaultRoute: 'subcutaneous/intramuscular',
    defaultCycleLength: 'ongoing with TRT',
    expectedShift: '↑ intratesticular testosterone, testicular volume preservation',
    category: 'ancillary',
  },
  {
    name: 'Clomiphene (Clomid)',
    key: 'clomiphene',
    defaultDose: '25–50 mg',
    defaultFrequency: 'daily or every other day',
    defaultRoute: 'oral',
    defaultCycleLength: '4–12 weeks (PCT or natural TRT)',
    expectedShift: '↑ LH/FSH, ↑ endogenous testosterone',
    category: 'ancillary',
  },
  {
    name: 'Tamoxifen (Nolvadex)',
    key: 'tamoxifen',
    defaultDose: '10–20 mg',
    defaultFrequency: 'daily or every other day',
    defaultRoute: 'oral',
    defaultCycleLength: '4–8 weeks (PCT)',
    expectedShift: '↑ LH/FSH, ↑ endogenous testosterone, anti-estrogenic',
    category: 'ancillary',
  },
  {
    name: 'Clenbuterol',
    key: 'clenbuterol',
    defaultDose: '20–40 mcg',
    defaultFrequency: 'daily (2 weeks on, 2 weeks off — up-titrate)',
    defaultRoute: 'oral',
    defaultCycleLength: '4–6 weeks',
    expectedShift: '↑ metabolic rate, fat oxidation',
    category: 'ancillary',
  },
];

// ── Protocol matching rules ───────────────────────────────────────────────────

/** Find a compound definition by key. */
function findCompound(key: string): CompoundDef | undefined {
  return COMPOUNDS.find((c) => c.key === key);
}

/** Check if a biomarker is low based on classified results. */
function isLow(classified: ClassifiedResult[], key: string): boolean {
  const match = classified.find((c) => c.biomarkerKey === key);
  return match?.status === 'LOW' || match?.status === 'BORDERLINE_LOW';
}

/** Check if a biomarker is high. */
function isHigh(classified: ClassifiedResult[], key: string): boolean {
  const match = classified.find((c) => c.biomarkerKey === key);
  return match?.status === 'HIGH' || match?.status === 'BORDERLINE_HIGH';
}

/** Get the latest value for a biomarker. */
function getLatestValue(classified: ClassifiedResult[], key: string): number | null {
  const match = classified.find((c) => c.biomarkerKey === key);
  return match?.valueNumeric ?? null;
}

/** Get KB reference IDs for a compound (from enriched findings). */
function kbRefsForCompound(finding: Finding | undefined): string[] {
  if (!finding?.references) return [];
  return finding.references.map((r: { documentTitle: string; page: number | null }) =>
    `${r.documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.page || 'unk'}`,
  ).slice(0, 3);
}

/** Get graph fact IDs (from enriched findings). */
function graphRefsForFinding(finding: Finding | undefined): string[] {
  if (!finding?.graphFacts) return [];
  return finding.graphFacts.map((_fact: string, i: number) => `graph-fact-${i}`);
}

// ── Main dosing engine ────────────────────────────────────────────────────────

/**
 * Generate dosing recommendations from engine analysis results.
 *
 * Rules are applied in priority order:
 *   1. Clinical priority — low testosterone → base TRT, high e2 → AI, high HCT → dose adjust
 *   2. Standard — secondary recommendations based on full biomarker panel
 *   3. Alternative — advanced protocols (Nandrolone, Tren, etc.) based on specific patterns
 */
export function generateDosingRecommendations(options: {
  classified: ClassifiedResult[];
  trends: Trend[];
  findings: Finding[];
  coverageGaps: CoverageGap[];
}): DosingRecommendation[] {
  const { classified, trends, findings } = options;
  const recs: DosingRecommendation[] = [];

  // ── 1. Clinical Priority: Base TRT for low testosterone ──────────────────
  const totalT = getLatestValue(classified, 'total_testosterone');
  const freeT = getLatestValue(classified, 'free_testosterone');
  const lowT = isLow(classified, 'total_testosterone') || isLow(classified, 'free_testosterone');

  if (lowT && totalT !== null) {
    // Choose compound based on patient profile
    const compound = totalT < 300
      ? findCompound('testosterone_cypionate')!
      : findCompound('testosterone_enanthate')!;

    const tFinding = findings.find(
      (f) => f.biomarkerKey === 'total_testosterone' || f.ruleId === 'PT-LOW-T',
    );

    recs.push({
      compound: compound.name,
      compoundKey: compound.key,
      dose: compound.defaultDose,
      frequency: compound.defaultFrequency,
      route: compound.defaultRoute,
      cycleLength: compound.defaultCycleLength,
      indication: `Low total testosterone (${totalT} ng/dL) — below typical reference range`,
      expectedBiomarkerShift: compound.expectedShift,
      ragSourceIds: [...kbRefsForCompound(tFinding), 'protocol-trt-base-001'],
      priority: 'clinical_priority',
      notes: totalT < 264
        ? 'Total testosterone below laboratory reference low — TRT indicated. Start at lower end of range, reassess at 12 weeks.'
        : 'Total testosterone in borderline/low range — consider TRT if symptoms correlate.',
      protocolKey: 'trt_base',
      indicationParams: { value: totalT, noteKey: totalT < 264 ? 'below_ref' : 'borderline' },
    });
  }

  // ── 2. Estradiol management ──────────────────────────────────────────────
  const estradiol = getLatestValue(classified, 'estradiol_sensitive');
  const highE2 = isHigh(classified, 'estradiol_sensitive');

  if (highE2 && estradiol !== null) {
    // Choose AI based on estradiol level
    const aiCompound = estradiol > 50
      ? findCompound('letrozole')!
      : estradiol > 35
        ? findCompound('anastrozole')!
        : findCompound('anastrozole')!;

    const e2Finding = findings.find((f) => f.biomarkerKey === 'estradiol_sensitive');

    recs.push({
      compound: aiCompound.name,
      compoundKey: aiCompound.key,
      dose: aiCompound.defaultDose,
      frequency: aiCompound.defaultFrequency,
      route: aiCompound.defaultRoute,
      cycleLength: aiCompound.defaultCycleLength,
      indication: `Elevated estradiol (${estradiol} pg/mL) — aromatization of testosterone`,
      expectedBiomarkerShift: aiCompound.expectedShift,
      ragSourceIds: [...kbRefsForCompound(e2Finding), 'protocol-e2-mgmt-001'],
      priority: 'clinical_priority',
      notes: estradiol > 50
        ? 'Estradiol significantly elevated — consider Letrozole (more potent AI).'
        : estradiol > 35
          ? 'Estradiol at upper range — Anastrozole at low dose sufficient.'
          : 'Estradiol mildly elevated — monitor, consider low-dose Anastrozole.',
      protocolKey: 'e2_high',
      indicationParams: {
        value: estradiol,
        noteKey: estradiol > 50 ? 'high' : estradiol > 35 ? 'upper' : 'mild',
      },
    });
  }

  // Low estradiol — consider stopping AI or reducing dose
  const lowE2 = isLow(classified, 'estradiol_sensitive');
  if (lowE2) {
    recs.push({
      compound: findCompound('anastrozole')!.name,
      compoundKey: findCompound('anastrozole')!.key,
      dose: '0.25 mg',
      frequency: '2x per week',
      route: 'oral',
      cycleLength: 'ongoing with TRT',
      indication: 'Estradiol low — consider reducing AI dose',
      expectedBiomarkerShift: '↑ estradiol by 5–15 pg/mL',
      ragSourceIds: ['protocol-e2-mgmt-002'],
      priority: 'standard',
      notes: 'If not already on an AI, no need to start. If on AI, consider dose reduction.',
      protocolKey: 'e2_low',
    });
  }

  // ── 3. Hematocrit management ─────────────────────────────────────────────
  const hematocrit = getLatestValue(classified, 'hematocrit');
  const highHct = isHigh(classified, 'hematocrit');

  if (highHct && hematocrit !== null) {
    const hctFinding = findings.find(
      (f) => f.biomarkerKey === 'hematocrit' || f.ruleId === 'RF-HEMATOCRIT-HIGH',
    );

    recs.push({
      compound: findCompound('testosterone_enanthate')!.name,
      compoundKey: findCompound('testosterone_enanthate')!.key,
      dose: hematocrit > 54
        ? '100 mg'
        : '100–150 mg',
      frequency: 'every 7 days',
      route: 'intramuscular',
      cycleLength: 'ongoing (reassess HCT at 8–12 weeks)',
      indication: `Elevated hematocrit (${hematocrit}%) — monitor for polycythemia`,
      expectedBiomarkerShift: 'Hematocrit may increase 2–5% over 8–12 weeks',
      ragSourceIds: [
        ...kbRefsForCompound(hctFinding),
        'protocol-hct-mgmt-001',
        'protocol-trt-dose-adjust-001',
      ],
      priority: 'clinical_priority',
      notes: hematocrit > 54
        ? 'Hematocrit above upper reference — consider phlebotomy if >55%. Use lower TRT dose initially.'
        : 'Hematocrit at upper range — monitor closely with TRT. Lower starting dose recommended.',
      protocolKey: 'hct_high',
      indicationParams: { value: hematocrit, noteKey: hematocrit > 54 ? 'high' : 'upper' },
    });
  }

  // ── 4. SHBG management ───────────────────────────────────────────────────
  const shbg = getLatestValue(classified, 'shbg');
  const highShbg = isHigh(classified, 'shbg');

  if (highShbg && shbg !== null) {
    recs.push({
      compound: findCompound('testosterone_cypionate')!.name,
      compoundKey: findCompound('testosterone_cypionate')!.key,
      dose: '150–200 mg',
      frequency: 'every 7 days',
      route: 'intramuscular',
      cycleLength: 'ongoing (12+ week assessment)',
      indication: `High SHBG (${shbg} nmol/L) — reduces free testosterone availability`,
      expectedBiomarkerShift: '↑ free testosterone by 15–30 pg/mL',
      ragSourceIds: ['protocol-shbg-mgmt-001'],
      priority: 'standard',
      notes: 'High SHBG binds testosterone, reducing free bioavailable T. Higher TRT dose may be needed.',
      protocolKey: 'shbg_high',
      indicationParams: { value: shbg },
    });
  }

  // ── 5. Nandrolone for low energy + normal/high T (body comp focus) ───────
  const normalT = getLatestValue(classified, 'total_testosterone');
  const lowEnergy = trends.find((t) => t.biomarkerKey === 'total_testosterone' && t.direction === 'DOWN');

  if (
    normalT !== null &&
    normalT >= 300 &&
    (lowEnergy || isLow(classified, 'free_testosterone'))
  ) {
    const nFinding = findings.find(
      (f) => f.ruleId === 'PT-LOW-T' || f.biomarkerKey === 'total_testosterone',
    );

    recs.push({
      compound: findCompound('nandrolone_decanoate')!.name,
      compoundKey: findCompound('nandrolone_decanoate')!.key,
      dose: findCompound('nandrolone_decanoate')!.defaultDose,
      frequency: findCompound('nandrolone_decanoate')!.defaultFrequency,
      route: findCompound('nandrolone_decanoate')!.defaultRoute,
      cycleLength: findCompound('nandrolone_decanoate')!.defaultCycleLength,
      indication: 'Normal total T but low free T or downward trend — Nandrolone may improve body composition with less aromatization',
      expectedBiomarkerShift: findCompound('nandrolone_decanoate')!.expectedShift,
      ragSourceIds: [
        ...kbRefsForCompound(nFinding),
        'protocol-nandrolone-001',
      ],
      priority: 'alternative',
      notes: 'Nandrolone is 19-nor — less aromatization than T. Monitor prolactin. May need hCG support.',
      protocolKey: 'nandrolone',
    });
  }

  // ── 6. Boldenone for lean gains ─────────────────────────────────────────
  const normalToHighT = normalT !== null && normalT >= 400;
  const lowHdl = isLow(classified, 'hdl');
  const highLdl = isHigh(classified, 'ldl');

  if (
    normalToHighT &&
    (lowHdl || highLdl)
  ) {
    recs.push({
      compound: findCompound('boldenone_undecylenate')!.name,
      compoundKey: findCompound('boldenone_undecylenate')!.key,
      dose: findCompound('boldenone_undecylenate')!.defaultDose,
      frequency: findCompound('boldenone_undecylenate')!.defaultFrequency,
      route: findCompound('boldenone_undecylenate')!.defaultRoute,
      cycleLength: findCompound('boldenone_undecylenate')!.defaultCycleLength,
      indication: 'Good testosterone + lipid imbalance — Boldenone for lean mass with moderate lipid impact',
      expectedBiomarkerShift: findCompound('boldenone_undecylenate')!.expectedShift,
      ragSourceIds: ['protocol-boldenone-001'],
      priority: 'alternative',
      notes: 'Boldenone has moderate lipid impact. Monitor LDL/HDL ratio. Less suppressive than Tren.',
      protocolKey: 'boldenone',
    });
  }

  // ── 7. Ancillary support recommendations ─────────────────────────────────
  // hCG for testicular support during TRT
  if (recs.some((r) => r.compoundKey.includes('testosterone'))) {
    recs.push({
      compound: findCompound('hcg')!.name,
      compoundKey: findCompound('hcg')!.key,
      dose: findCompound('hcg')!.defaultDose,
      frequency: findCompound('hcg')!.defaultFrequency,
      route: findCompound('hcg')!.defaultRoute,
      cycleLength: findCompound('hcg')!.defaultCycleLength,
      indication: 'Testicular volume preservation + intratesticular testosterone during TRT',
      expectedBiomarkerShift: findCompound('hcg')!.expectedShift,
      ragSourceIds: ['protocol-hcg-001'],
      priority: 'standard',
      notes: 'hCG mimics LH — maintains Leydig cell function. Essential if fertility is a goal.',
      protocolKey: 'hcg_support',
    });
  }

  // Clomiphene for PCT or natural TRT
  if (recs.length > 0) {
    recs.push({
      compound: findCompound('clomiphene')!.name,
      compoundKey: findCompound('clomiphene')!.key,
      dose: findCompound('clomiphene')!.defaultDose,
      frequency: findCompound('clomiphene')!.defaultFrequency,
      route: findCompound('clomiphene')!.defaultRoute,
      cycleLength: findCompound('clomiphene')!.defaultCycleLength,
      indication: 'Post-TRT recovery or natural T stimulation alternative',
      expectedBiomarkerShift: findCompound('clomiphene')!.expectedShift,
      ragSourceIds: ['protocol-clomiphene-001'],
      priority: 'alternative',
      notes: 'SERM — blocks estrogen at pituitary, ↑ LH/FSH, ↑ endogenous T. Use 4–12 weeks post-TRT.',
      protocolKey: 'clomiphene',
    });
  }

  // Clenbuterol for cutting phases
  const cuttingPhase = trends.some(
    (t) => t.biomarkerKey === 'body_fat_pct' || t.biomarkerKey === 'body_composition',
  );
  if (cuttingPhase) {
    recs.push({
      compound: findCompound('clenbuterol')!.name,
      compoundKey: findCompound('clenbuterol')!.key,
      dose: findCompound('clenbuterol')!.defaultDose,
      frequency: findCompound('clenbuterol')!.defaultFrequency,
      route: findCompound('clenbuterol')!.defaultRoute,
      cycleLength: findCompound('clenbuterol')!.defaultCycleLength,
      indication: 'Fat loss phase — beta-2 agonist increases metabolic rate',
      expectedBiomarkerShift: findCompound('clenbuterol')!.expectedShift,
      ragSourceIds: ['protocol-clen-001'],
      priority: 'alternative',
      notes: '2 weeks on / 2 weeks off to prevent receptor downregulation. Start low (20 mcg), titrate.',
      protocolKey: 'clenbuterol',
    });
  }

  // ── 8. Coverage gap recommendations ──────────────────────────────────────
  const missingPanels = options.coverageGaps
    .filter((g) => g.missingBiomarkerKeys.length > 0)
    .map((g) => ({ category: g.category, keys: g.missingBiomarkerKeys }));

  if (missingPanels.length > 0) {
    const additional = missingPanels
      .map((p) => `${p.category}: ${p.keys.join(', ')}`)
      .join('; ');

    recs.push({
      compound: 'Panel Completion',
      compoundKey: 'missing_panels',
      dose: 'TBD',
      frequency: 'per lab schedule',
      route: 'blood draw',
      cycleLength: 'as needed',
      indication: `Missing panels: ${additional}`,
      expectedBiomarkerShift: 'Complete biomarker picture for accurate dosing',
      ragSourceIds: ['protocol-panel-001'],
      priority: 'clinical_priority',
      notes: 'Full hormone panel (LH, FSH, prolactin), metabolic panel (A1C, glucose), lipid panel needed for optimal dosing.',
      protocolKey: 'panel_completion',
      indicationParams: { panels: JSON.stringify(missingPanels) },
    });
  }

  // ── 9. Sort by priority ──────────────────────────────────────────────────
  const priorityOrder = { clinical_priority: 0, standard: 1, alternative: 2 };
  return recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
