/**
 * Seed the biomarker catalog (GOLD §5.7) and nothing else.
 *
 * Reference ranges here are *typical adult-male* defaults, advisory only — the
 * authoritative range for any given result is stored per-LabResult because
 * ranges differ by lab/assay (GOLD §5.7).
 *
 *   pnpm --filter @trt/db seed
 */
import { PrismaClient } from '../src/generated/client/index.js';

type Marker = {
  key: string;
  name: string;
  category: string;
  canonicalUnit: string;
  refLow?: number;
  refHigh?: number;
  refUnit?: string;
  notes?: string;
};

const markers: Marker[] = [
  // ── Hormones (GOLD §5.7) ──────────────────────────────────────────────────
  { key: 'total_testosterone', name: 'Total Testosterone', category: 'hormone', canonicalUnit: 'ng/dL', refLow: 264, refHigh: 916, refUnit: 'ng/dL' },
  { key: 'free_testosterone', name: 'Free Testosterone', category: 'hormone', canonicalUnit: 'pg/mL', refLow: 47, refHigh: 244, refUnit: 'pg/mL' },
  { key: 'bioavailable_testosterone', name: 'Bioavailable Testosterone', category: 'hormone', canonicalUnit: 'ng/dL', refLow: 110, refHigh: 575, refUnit: 'ng/dL' },
  { key: 'shbg', name: 'SHBG', category: 'hormone', canonicalUnit: 'nmol/L', refLow: 16.5, refHigh: 55.9, refUnit: 'nmol/L' },
  { key: 'albumin', name: 'Albumin', category: 'cmp', canonicalUnit: 'g/dL', refLow: 3.5, refHigh: 5.0, refUnit: 'g/dL' },
  { key: 'lh', name: 'LH', category: 'hormone', canonicalUnit: 'mIU/mL', refLow: 1.7, refHigh: 8.6, refUnit: 'mIU/mL' },
  { key: 'fsh', name: 'FSH', category: 'hormone', canonicalUnit: 'mIU/mL', refLow: 1.5, refHigh: 12.4, refUnit: 'mIU/mL' },
  { key: 'estradiol_sensitive', name: 'Estradiol, Sensitive', category: 'hormone', canonicalUnit: 'pg/mL', refLow: 10, refHigh: 40, refUnit: 'pg/mL' },
  { key: 'prolactin', name: 'Prolactin', category: 'hormone', canonicalUnit: 'ng/mL', refLow: 4.0, refHigh: 15.2, refUnit: 'ng/mL' },
  { key: 'dhea_s', name: 'DHEA-S', category: 'hormone', canonicalUnit: 'ug/dL', refLow: 98, refHigh: 340, refUnit: 'ug/dL' },
  { key: 'pregnenolone', name: 'Pregnenolone', category: 'hormone', canonicalUnit: 'ng/dL', refLow: 22, refHigh: 237, refUnit: 'ng/dL' },
  { key: 'cortisol_am', name: 'Cortisol (AM)', category: 'hormone', canonicalUnit: 'ug/dL', refLow: 6.7, refHigh: 22.6, refUnit: 'ug/dL' },
  { key: 'cortisol_pm', name: 'Cortisol (PM)', category: 'hormone', canonicalUnit: 'ug/dL', refLow: 2.3, refHigh: 11.9, refUnit: 'ug/dL' },
  { key: 'igf_1', name: 'IGF-1', category: 'hormone', canonicalUnit: 'ng/mL', refLow: 88, refHigh: 246, refUnit: 'ng/mL' },

  // ── Thyroid ───────────────────────────────────────────────────────────────
  { key: 'tsh', name: 'TSH', category: 'thyroid', canonicalUnit: 'mIU/L', refLow: 0.4, refHigh: 4.5, refUnit: 'mIU/L' },
  { key: 'free_t3', name: 'Free T3', category: 'thyroid', canonicalUnit: 'pg/mL', refLow: 2.3, refHigh: 4.2, refUnit: 'pg/mL' },
  { key: 'free_t4', name: 'Free T4', category: 'thyroid', canonicalUnit: 'ng/dL', refLow: 0.8, refHigh: 1.8, refUnit: 'ng/dL' },
  { key: 'reverse_t3', name: 'Reverse T3', category: 'thyroid', canonicalUnit: 'pg/mL', refLow: 9.4, refHigh: 24.2, refUnit: 'pg/mL' },

  // ── Prostate ──────────────────────────────────────────────────────────────
  { key: 'psa', name: 'PSA', category: 'prostate', canonicalUnit: 'ng/mL', refLow: 0, refHigh: 4.0, refUnit: 'ng/mL' },

  // ── CBC ───────────────────────────────────────────────────────────────────
  { key: 'hemoglobin', name: 'Hemoglobin', category: 'cbc', canonicalUnit: 'g/dL', refLow: 13.5, refHigh: 17.5, refUnit: 'g/dL' },
  { key: 'hematocrit', name: 'Hematocrit', category: 'cbc', canonicalUnit: '%', refLow: 41, refHigh: 53, refUnit: '%' },
  { key: 'rbc', name: 'RBC', category: 'cbc', canonicalUnit: 'M/uL', refLow: 4.3, refHigh: 5.9, refUnit: 'M/uL' },
  { key: 'wbc', name: 'WBC', category: 'cbc', canonicalUnit: 'K/uL', refLow: 3.4, refHigh: 9.6, refUnit: 'K/uL' },
  { key: 'platelets', name: 'Platelets', category: 'cbc', canonicalUnit: 'K/uL', refLow: 150, refHigh: 450, refUnit: 'K/uL' },

  // ── CMP / metabolic ───────────────────────────────────────────────────────
  { key: 'alt', name: 'ALT', category: 'cmp', canonicalUnit: 'U/L', refLow: 7, refHigh: 56, refUnit: 'U/L' },
  { key: 'ast', name: 'AST', category: 'cmp', canonicalUnit: 'U/L', refLow: 10, refHigh: 40, refUnit: 'U/L' },
  { key: 'creatinine', name: 'Creatinine', category: 'cmp', canonicalUnit: 'mg/dL', refLow: 0.7, refHigh: 1.3, refUnit: 'mg/dL' },
  { key: 'egfr', name: 'eGFR', category: 'cmp', canonicalUnit: 'mL/min/1.73m2', refLow: 90, refHigh: 120, refUnit: 'mL/min/1.73m2' },
  { key: 'bun', name: 'BUN', category: 'cmp', canonicalUnit: 'mg/dL', refLow: 7, refHigh: 20, refUnit: 'mg/dL' },
  { key: 'sodium', name: 'Sodium', category: 'cmp', canonicalUnit: 'mmol/L', refLow: 135, refHigh: 145, refUnit: 'mmol/L' },
  { key: 'potassium', name: 'Potassium', category: 'cmp', canonicalUnit: 'mmol/L', refLow: 3.5, refHigh: 5.1, refUnit: 'mmol/L' },
  { key: 'globulin', name: 'Globulin', category: 'cmp', canonicalUnit: 'g/dL', refLow: 2.0, refHigh: 3.5, refUnit: 'g/dL' },

  // ── Lipids ────────────────────────────────────────────────────────────────
  { key: 'hdl', name: 'HDL', category: 'lipid', canonicalUnit: 'mg/dL', refLow: 40, refHigh: 60, refUnit: 'mg/dL' },
  { key: 'ldl', name: 'LDL', category: 'lipid', canonicalUnit: 'mg/dL', refLow: 0, refHigh: 100, refUnit: 'mg/dL' },
  { key: 'triglycerides', name: 'Triglycerides', category: 'lipid', canonicalUnit: 'mg/dL', refLow: 0, refHigh: 150, refUnit: 'mg/dL' },
  { key: 'total_cholesterol', name: 'Total Cholesterol', category: 'lipid', canonicalUnit: 'mg/dL', refLow: 0, refHigh: 200, refUnit: 'mg/dL' },

  // ── Inflammation / iron ───────────────────────────────────────────────────
  { key: 'hscrp', name: 'hs-CRP', category: 'inflammation', canonicalUnit: 'mg/L', refLow: 0, refHigh: 3.0, refUnit: 'mg/L' },
  { key: 'ferritin', name: 'Ferritin', category: 'inflammation', canonicalUnit: 'ng/mL', refLow: 30, refHigh: 400, refUnit: 'ng/mL' },
  { key: 'iron', name: 'Iron', category: 'inflammation', canonicalUnit: 'ug/dL', refLow: 60, refHigh: 170, refUnit: 'ug/dL' },

  // ── Vitamins / metabolic ──────────────────────────────────────────────────
  { key: 'vitamin_d', name: 'Vitamin D', category: 'vitamin', canonicalUnit: 'ng/mL', refLow: 30, refHigh: 100, refUnit: 'ng/mL' },
  { key: 'vitamin_b12', name: 'Vitamin B12', category: 'vitamin', canonicalUnit: 'pg/mL', refLow: 232, refHigh: 1245, refUnit: 'pg/mL' },
  { key: 'folate', name: 'Folate', category: 'vitamin', canonicalUnit: 'ng/mL', refLow: 7, refHigh: 31.4, refUnit: 'ng/mL' },
  { key: 'a1c', name: 'Hemoglobin A1C', category: 'metabolic', canonicalUnit: '%', refLow: 4.0, refHigh: 5.6, refUnit: '%' },
  { key: 'insulin', name: 'Insulin', category: 'metabolic', canonicalUnit: 'uIU/mL', refLow: 2.6, refHigh: 24.9, refUnit: 'uIU/mL' },
  { key: 'glucose', name: 'Glucose', category: 'metabolic', canonicalUnit: 'mg/dL', refLow: 70, refHigh: 99, refUnit: 'mg/dL' },
];

async function main() {
  const prisma = new PrismaClient();
  let created = 0;
  let updated = 0;
  for (const m of markers) {
    const res = await prisma.biomarker.upsert({
      where: { key: m.key },
      create: m,
      update: {
        name: m.name,
        category: m.category,
        canonicalUnit: m.canonicalUnit,
        refLow: m.refLow,
        refHigh: m.refHigh,
        refUnit: m.refUnit,
        notes: m.notes,
      },
    });
    if (res.createdAt?.getTime?.() === res.updatedAt?.getTime?.()) created++;
    else updated++;
    console.log(`  • ${res.key.padEnd(26)} [${res.category}]`);
  }
  console.log(`\n✓ Seed complete: ${markers.length} biomarkers (${created} new, ${updated} updated).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('✗ Seed failed:', e);
  process.exit(1);
});
