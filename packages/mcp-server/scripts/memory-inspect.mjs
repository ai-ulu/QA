import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

function parseArgs(argv) {
  const args = {
    repo: '.',
    pretty: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--repo') {
      args.repo = argv[index + 1] ?? '.';
      index += 1;
      continue;
    }
    if (token === '--compact') {
      args.pretty = false;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
}

function buildSummary(memory) {
  return {
    schemaVersion: memory.schemaVersion ?? null,
    updatedAt: memory.updatedAt ?? null,
    repoFingerprint: memory.repoFingerprint ?? null,
    knownFlakyTests: Array.isArray(memory.knownFlakyTests) ? memory.knownFlakyTests.length : 0,
    recentFailures: Array.isArray(memory.recentFailures) ? memory.recentFailures.length : 0,
    acceptedPatches: Array.isArray(memory.acceptedPatches) ? memory.acceptedPatches.length : 0,
    rejectedPatches: Array.isArray(memory.rejectedPatches) ? memory.rejectedPatches.length : 0,
    selectorHistory: Array.isArray(memory.selectorHistory) ? memory.selectorHistory.length : 0,
    routeHistory: Array.isArray(memory.routeHistory) ? memory.routeHistory.length : 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log('Usage: node scripts/memory-inspect.mjs [--repo <path>] [--compact]');
    process.exit(0);
  }

  const repoPath = resolve(args.repo);
  const memoryPath = join(repoPath, '.autoqa', 'state', 'memory.json');
  const raw = await readFile(memoryPath, 'utf8').catch(() => null);

  if (!raw) {
    console.log(JSON.stringify({ ok: false, repoPath, memoryPath, reason: 'memory_not_found' }, null, 2));
    process.exit(0);
  }

  try {
    const memory = JSON.parse(raw);
    const output = {
      ok: true,
      repoPath,
      memoryPath,
      summary: buildSummary(memory),
      memory: args.pretty ? memory : undefined,
    };
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          repoPath,
          memoryPath,
          reason: 'invalid_json',
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
