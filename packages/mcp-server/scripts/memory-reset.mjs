import { rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

function parseArgs(argv) {
  const args = {
    repo: '.',
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--repo') {
      args.repo = argv[index + 1] ?? '.';
      index += 1;
      continue;
    }
    if (token === '--force') {
      args.force = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log('Usage: node scripts/memory-reset.mjs [--repo <path>] [--force]');
    process.exit(0);
  }

  const repoPath = resolve(args.repo);
  const memoryPath = join(repoPath, '.autoqa', 'state', 'memory.json');

  if (!args.force) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          repoPath,
          memoryPath,
          reason: 'confirmation_required',
          hint: 'Run again with --force to delete local memory state.',
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  await rm(memoryPath, { force: true });
  console.log(JSON.stringify({ ok: true, repoPath, memoryPath, deleted: true }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
