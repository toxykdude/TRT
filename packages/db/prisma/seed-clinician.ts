#!/usr/bin/env tsx
/**
 * Verify (or revoke) a clinician's license (GOLD §2.4) — manual admin path.
 *
 * The dosing/protocol reference module is computed ONLY for a CLINICIAN whose
 * license is verified (licenseVerifiedAt != null). The full admin verification
 * queue is Phase 2; this script provisions a verified clinician so the P0.1.d
 * integration tests and manual QA can exercise the dosing surface.
 *
 * Usage:
 *   pnpm --filter @trt/db exec tsx prisma/seed-clinician.ts \
 *     --email clinician@example.com --state NY --npi 1234567890
 *
 *   # revoke (clears licenseVerifiedAt/licenseState/npi; role stays CLINICIAN):
 *   pnpm --filter @trt/db exec tsx prisma/seed-clinician.ts \
 *     --email clinician@example.com --revoke
 */
import { prisma } from '../src/index.js';

type Args = {
  email?: string;
  state?: string;
  npi?: string;
  revoke?: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith('--email=')) out.email = a.slice(8);
    else if (a.startsWith('--state=')) out.state = a.slice(8);
    else if (a.startsWith('--npi=')) out.npi = a.slice(6);
    else if (a === '--revoke') out.revoke = true;
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv);
  if (!args.email) {
    console.error('Usage: seed-clinician.ts --email <email> [--state <ST>] [--npi <npi>] [--revoke]');
    return 2;
  }

  if (args.revoke) {
    const u = await prisma.user.updateMany({
      where: { email: args.email },
      data: { licenseVerifiedAt: null, licenseState: null, npi: null },
    });
    console.log(`Revoked license verification for ${args.email} (${u.count} row(s)).`);
    return 0;
  }

  if (!args.state || !args.npi) {
    console.error('--state and --npi are required to verify (or pass --revoke).');
    return 2;
  }

  const u = await prisma.user.update({
    where: { email: args.email },
    data: {
      role: 'CLINICIAN',
      licenseVerifiedAt: new Date(),
      licenseState: args.state,
      npi: args.npi,
    },
    select: { id: true, email: true, role: true, licenseVerifiedAt: true, licenseState: true, npi: true },
  });
  console.log('Verified clinician:');
  console.log(JSON.stringify(u, null, 2));
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
