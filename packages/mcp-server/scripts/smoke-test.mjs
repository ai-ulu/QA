import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const packageManifest = JSON.parse(
  await readFile(resolve(packageDir, 'package.json'), 'utf8')
);
const serverEntry = resolve(packageDir, 'dist/index.js');
const ciImpactScript = resolve(packageDir, 'scripts/ci-impact.mjs');
const cliEntry = resolve(packageDir, 'dist/cli.js');

const expectedTools = [
  'autoqa_ci_summary',
  'autoqa_execute_run_plan',
  'autoqa_impact_analysis',
  'autoqa_patch_file',
  'autoqa_pr_summary',
  'autoqa_scan_repo',
  'autoqa_suggest_patch',
  'autoqa_targeted_run_plan',
  'autoqa_verify_patch',
];

const execFileAsync = promisify(execFile);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const client = new Client(
  {
    name: 'autoqa-mcp-smoke',
    version: '0.1.0',
  },
  {
    capabilities: {},
  }
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  stderr: 'ignore',
});

const reportsDir = resolve(packageDir, 'reports');

async function createRepoFixture() {
  await mkdir(join(packageDir, '.tmp-fixtures'), { recursive: true });
  const repoPath = await mkdtemp(join(packageDir, '.tmp-fixtures', 'autoqa-mcp-repo-'));
  await mkdir(join(repoPath, 'tests'), { recursive: true });
  await mkdir(join(repoPath, 'qa-tests'), { recursive: true });
  await mkdir(join(repoPath, 'src'), { recursive: true });
  await mkdir(join(repoPath, 'test-results', 'login-selector-drift'), { recursive: true });

  await writeFile(
    join(repoPath, 'package.json'),
    `${JSON.stringify(
      {
        name: 'smoke-repo',
        private: true,
        devDependencies: {
          playwright: '^1.40.0',
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(join(repoPath, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
  await writeFile(join(repoPath, '.autoqaignore'), 'src/ignored.tsx\n', 'utf8');
  await writeFile(
    join(repoPath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: ['src/auth/**', 'src/billing/**'],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: ['main', 'release/*'],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'guarded_apply',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(
    join(repoPath, 'playwright.config.ts'),
    `import { defineConfig } from 'playwright/test';\n\nexport default defineConfig({\n  use: {\n    baseURL: 'http://127.0.0.1:3000',\n  },\n});\n`,
    'utf8'
  );
  await writeFile(
    join(repoPath, 'tests', 'login.spec.ts'),
    `import { test, expect } from 'playwright/test';\nimport { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\n\ntest('login button', async ({ page }) => {\n  const component = readFileSync(join(process.cwd(), 'src', 'login-button.tsx'), 'utf8');\n  const className = component.match(/className="([^"]+)"/)?.[1] ?? 'missing-class';\n  const label = component.match(/>([^<]+)</)?.[1] ?? 'missing-label';\n  await page.setContent(\`<button class="\${className}">\${label}</button>\`);\n  await expect(page.locator('.login-button')).toBeVisible();\n});\n`,
    'utf8'
  );
  await writeFile(
    join(repoPath, 'tests', 'navigation.spec.ts'),
    `import { test, expect } from 'playwright/test';\n\ntest('navigation smoke', async ({ page }) => {\n  await page.goto('/');\n  await expect(page.locator('body')).toBeVisible();\n});\n`,
    'utf8'
  );
  await writeFile(
    join(repoPath, 'qa-tests', 'checkout.flow.ts'),
    `export const smoke = 'checkout';\n`,
    'utf8'
  );
  await writeFile(
    join(repoPath, 'src', 'app.tsx'),
    `export function App() {\n  return <button className="login-button">Login</button>;\n}\n`,
    'utf8'
  );
  await writeFile(
    join(repoPath, 'src', 'login-button.tsx'),
    `export function LoginButton() {\n  return <button className="login-button">Login</button>;\n}\n`,
    'utf8'
  );
  await writeFile(
    join(repoPath, 'src', 'ignored.tsx'),
    `export const ignored = 'ignore me';\n`,
    'utf8'
  );
  await writeFile(
    join(repoPath, 'test-results', 'login-selector-drift', 'error-context.md'),
    [
      '# Error Context',
      '',
      "Locator: page.locator('.login-button')",
      'Error: element(s) not found',
      'Expected: visible',
    ].join('\n'),
    'utf8'
  );

  await execFileAsync('git', ['init'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'autoqa@example.com'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'AutoQA Smoke'], { cwd: repoPath });
  await execFileAsync('git', ['add', '.'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'initial fixture'], { cwd: repoPath });
  await execFileAsync('git', ['checkout', '-b', 'feature/impact-maintenance'], { cwd: repoPath });

  return repoPath;
}

function extractText(result) {
  return (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}

function extractMatch(text, regex, message) {
  const match = text.match(regex);
  assert.ok(match, message);
  return match[1];
}

function parseToolPayload(result, expectedToolName) {
  const payload = JSON.parse(extractText(result));
  assert.match(payload.runId, /^autoqa_/);
  assert.equal(payload.toolName, expectedToolName);
  assert.equal(typeof payload.generatedAt, 'string');
  assert.ok(Array.isArray(payload.artifacts));
  assert.ok(payload.result && typeof payload.result === 'object');
  return payload;
}

let repoFixturePath;

try {
  await rm(reportsDir, { recursive: true, force: true });
  repoFixturePath = await createRepoFixture();
  const cliVersionResult = await execFileAsync(process.execPath, [cliEntry, '--version']);
  assert.match(cliVersionResult.stdout, new RegExp(`v${packageManifest.version}`));
  await client.connect(transport);

  const listResult = await client.listTools();
  const toolNames = (listResult.tools ?? []).map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, [...expectedTools].sort());

  const scanResult = await client.callTool({
    name: 'autoqa_scan_repo',
    arguments: {
      repoPath: repoFixturePath,
      sampleLimit: 5,
    },
  });
  const scanPayload = parseToolPayload(scanResult, 'autoqa_scan_repo');
  assert.equal(scanPayload.status, 'completed');
  assert.equal(scanPayload.packageManager, 'pnpm');
  assert.ok(scanPayload.frameworks.includes('playwright'));
  assert.ok(scanPayload.playwrightConfigFiles.includes('playwright.config.ts'));
  assert.ok(scanPayload.sampleTestFiles.includes('tests/login.spec.ts'));
  assert.ok(scanPayload.sampleTestFiles.includes('qa-tests/checkout.flow.ts'));
  assert.ok(scanPayload.recommendedTargets.includes('tests/login.spec.ts'));
  assert.ok(scanPayload.notes.some((note) => /ignore pattern/i.test(note)));
  assert.ok(!scanPayload.sampleSourceFiles.includes('src/ignored.tsx'));

  const patchResult = await client.callTool({
    name: 'autoqa_patch_file',
    arguments: {
      repoPath: repoFixturePath,
      filePath: 'tests/login.spec.ts',
      action: 'replace',
      findText: "page.locator('.login-button')",
      content: "page.getByRole('button', { name: 'Login' })",
      expectedMatches: 1,
    },
  });
  const patchPayload = JSON.parse(extractText(patchResult));
  assert.equal(patchPayload.changed, true);
  assert.equal(patchPayload.matchCount, 1);

  const patchedTestFile = await readFile(join(repoFixturePath, 'tests', 'login.spec.ts'), 'utf8');
  assert.match(patchedTestFile, /getByRole\('button', \{ name: 'Login' \}\)/);

  await writeFile(
    join(repoFixturePath, 'tests', 'login.spec.ts'),
    `import { test, expect } from 'playwright/test';\nimport { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\n\ntest('login button', async ({ page }) => {\n  const component = readFileSync(join(process.cwd(), 'src', 'login-button.tsx'), 'utf8');\n  const className = component.match(/className="([^"]+)"/)?.[1] ?? 'missing-class';\n  const label = component.match(/>([^<]+)</)?.[1] ?? 'missing-label';\n  await page.setContent(\`<button class="\${className}">\${label}</button>\`);\n  await expect(page.locator('.login-button')).toBeVisible();\n});\n`,
    'utf8'
  );

  const suggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Login button selector drift. Prefer a role-based locator.',
      sampleLimit: 5,
    },
  });
  const suggestPatchPayload = JSON.parse(extractText(suggestPatchResult));
  assert.equal(suggestPatchPayload.targetFile, 'tests/login.spec.ts');
  assert.equal(suggestPatchPayload.patch.dryRun, true);
  assert.match(suggestPatchPayload.patch.findText, /page\.locator/);
  assert.match(suggestPatchPayload.patch.content, /getByRole/);
  assert.match(suggestPatchPayload.diff, /\+  await expect\(page\.getByRole\('button', \{ name: 'Login' \}\)\)\.toBeVisible\(\);/);
  assert.ok(Array.isArray(suggestPatchPayload.evidenceUsed));
  assert.equal(suggestPatchPayload.evidenceUsed.length, 0);

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: ['src/auth/**', 'src/billing/**'],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: [],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'suggest_only',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const suggestOnlyModeResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Login button selector drift. Prefer a role-based locator.',
      apply: true,
      sampleLimit: 5,
    },
  });
  const suggestOnlyModePayload = JSON.parse(extractText(suggestOnlyModeResult));
  assert.equal(suggestOnlyModePayload.applied, false);
  assert.ok(suggestOnlyModePayload.blockedReasonCodes.includes('automation_mode_blocked'));
  assert.equal(suggestOnlyModePayload.policy.automationMode, 'suggest_only');
  assert.equal(suggestOnlyModePayload.policy.automationSource, 'repo_config');

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: ['src/auth/**', 'src/billing/**'],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.55,
            verify: 0.6,
          },
          branch: {
            reportOnly: [],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'guarded_apply',
            branchOverrides: [{ pattern: 'feature/*', mode: 'auto_apply' }],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const autoApplyBranchOverrideResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Login button selector drift. Prefer a role-based locator.',
      sampleLimit: 5,
    },
  });
  const autoApplyBranchOverridePayload = JSON.parse(extractText(autoApplyBranchOverrideResult));
  assert.equal(autoApplyBranchOverridePayload.applied, true);
  assert.equal(autoApplyBranchOverridePayload.patch.dryRun, false);
  assert.equal(autoApplyBranchOverridePayload.policy.automationMode, 'auto_apply');
  assert.equal(autoApplyBranchOverridePayload.policy.automationSource, 'branch_override');
  assert.equal(autoApplyBranchOverridePayload.policy.automationPattern, 'feature/*');

  await writeFile(
    join(repoFixturePath, 'tests', 'login.spec.ts'),
    `import { test, expect } from 'playwright/test';\nimport { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\n\ntest('login button', async ({ page }) => {\n  const component = readFileSync(join(process.cwd(), 'src', 'login-button.tsx'), 'utf8');\n  const className = component.match(/className="([^"]+)"/)?.[1] ?? 'missing-class';\n  const label = component.match(/>([^<]+)</)?.[1] ?? 'missing-label';\n  await page.setContent(\`<button class="\${className}">\${label}</button>\`);\n  await expect(page.locator('.login-button')).toBeVisible();\n});\n`,
    'utf8'
  );

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: ['src/auth/**', 'src/billing/**'],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: ['feature/*'],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'auto_apply',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const policyBlockedSuggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Login button selector drift. Prefer a role-based locator.',
      apply: true,
      sampleLimit: 5,
    },
  });
  const policyBlockedSuggestPatchPayload = JSON.parse(extractText(policyBlockedSuggestPatchResult));
  assert.equal(policyBlockedSuggestPatchPayload.applied, false);
  assert.equal(policyBlockedSuggestPatchPayload.patch.dryRun, true);
  assert.match(policyBlockedSuggestPatchPayload.reason, /Blocked by policy:/i);
  assert.ok(Array.isArray(policyBlockedSuggestPatchPayload.blockedReasons));
  assert.ok(policyBlockedSuggestPatchPayload.blockedReasons.length > 0);
  assert.ok(Array.isArray(policyBlockedSuggestPatchPayload.blockedReasonCodes));
  assert.ok(policyBlockedSuggestPatchPayload.blockedReasonCodes.includes('branch_report_only'));
  assert.equal(policyBlockedSuggestPatchPayload.policy.mode, 'auto');
  assert.equal(policyBlockedSuggestPatchPayload.policy.source, 'repo_config');
  assert.equal(policyBlockedSuggestPatchPayload.policy.automationMode, 'report_only');
  assert.equal(policyBlockedSuggestPatchPayload.policy.automationSource, 'legacy_report_only_branch');
  assert.equal(policyBlockedSuggestPatchPayload.policy.shouldApply, false);
  assert.ok(Array.isArray(policyBlockedSuggestPatchPayload.policy.blockedReasons));
  assert.ok(Array.isArray(policyBlockedSuggestPatchPayload.policy.blockedReasonCodes));

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: ['src/auth/**', 'src/billing/**'],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: ['main', 'release/*'],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'auto_apply',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const cliReportOnlySuggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Login button selector drift. Prefer a role-based locator.',
      apply: true,
      policyMode: 'report_only',
      sampleLimit: 5,
    },
  });
  const cliReportOnlySuggestPatchPayload = JSON.parse(extractText(cliReportOnlySuggestPatchResult));
  assert.equal(cliReportOnlySuggestPatchPayload.applied, false);
  assert.equal(cliReportOnlySuggestPatchPayload.patch.dryRun, true);
  assert.match(cliReportOnlySuggestPatchPayload.reason, /Blocked by policy:/i);
  assert.ok(cliReportOnlySuggestPatchPayload.blockedReasons.some((line) => /report_only/i.test(line)));
  assert.equal(cliReportOnlySuggestPatchPayload.policy.mode, 'report_only');
  assert.equal(cliReportOnlySuggestPatchPayload.policy.source, 'cli_override');
  assert.equal(cliReportOnlySuggestPatchPayload.policy.automationMode, 'report_only');
  assert.equal(cliReportOnlySuggestPatchPayload.policy.automationSource, 'cli_override');
  assert.equal(cliReportOnlySuggestPatchPayload.policy.shouldApply, false);
  assert.ok(cliReportOnlySuggestPatchPayload.blockedReasonCodes.includes('branch_report_only'));

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: ['tests/**'],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: [],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'auto_apply',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const protectedSuggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Login button selector drift. Prefer a role-based locator.',
      apply: false,
      sampleLimit: 5,
    },
  });
  const protectedSuggestPatchPayload = JSON.parse(extractText(protectedSuggestPatchResult));
  assert.equal(protectedSuggestPatchPayload.applied, false);
  assert.ok(protectedSuggestPatchPayload.blockedReasonCodes.includes('protected_file'));
  assert.equal(protectedSuggestPatchPayload.policy.automationMode, 'auto_apply');
  assert.equal(protectedSuggestPatchPayload.policy.source, 'repo_config');

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: [],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: [],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'auto_apply',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const thresholdSuggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Login button selector drift. Prefer a role-based locator.',
      apply: false,
      policyMode: 'enforce',
      applyThresholdOverride: 0.99,
      sampleLimit: 5,
    },
  });
  const thresholdSuggestPatchPayload = JSON.parse(extractText(thresholdSuggestPatchResult));
  assert.equal(thresholdSuggestPatchPayload.applied, false);
  assert.equal(thresholdSuggestPatchPayload.policy.source, 'cli_override');
  assert.equal(thresholdSuggestPatchPayload.policy.automationMode, 'auto_apply');
  assert.ok(thresholdSuggestPatchPayload.blockedReasonCodes.includes('below_apply_threshold'));

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: [],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: [],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'guarded_apply',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const artifactSuggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Login button selector drift. Prefer a role-based locator.',
      reportDir: 'test-results',
      sampleLimit: 5,
    },
  });
  const artifactSuggestPatchPayload = JSON.parse(extractText(artifactSuggestPatchResult));
  assert.equal(artifactSuggestPatchPayload.targetFile, 'tests/login.spec.ts');
  assert.ok(Array.isArray(artifactSuggestPatchPayload.evidenceUsed));
  assert.ok(artifactSuggestPatchPayload.evidenceUsed.length > 0);
  assert.equal(artifactSuggestPatchPayload.evidenceUsed[0].kind, 'selector_drift');
  assert.match(artifactSuggestPatchPayload.reason, /Artifact evidence:/i);

  const renameIssueSuggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Button text changed from "Login" to "Log in"; update affected locator/assertion.',
      changedFiles: ['tests/login.spec.ts'],
      sampleLimit: 5,
    },
  });
  const renameIssueSuggestPatchPayload = JSON.parse(extractText(renameIssueSuggestPatchResult));
  assert.equal(renameIssueSuggestPatchPayload.targetFile, 'tests/login.spec.ts');
  assert.match(renameIssueSuggestPatchPayload.patch.findText, /locator|name: 'Login'/);
  assert.match(renameIssueSuggestPatchPayload.patch.content, /getByRole|name: 'Log in'/);

  const impactAnalysisResult = await client.callTool({
    name: 'autoqa_impact_analysis',
    arguments: {
      repoPath: repoFixturePath,
      changedFiles: ['src/login-button.tsx'],
      sampleLimit: 5,
    },
  });
  const impactPayload = parseToolPayload(impactAnalysisResult, 'autoqa_impact_analysis');
  assert.equal(impactPayload.changedFiles[0], 'src/login-button.tsx');
  assert.match(impactPayload.summary, /affected test target/i);
  assert.ok(Array.isArray(impactPayload.affectedTests));
  assert.equal(impactPayload.affectedTests[0].file, 'tests/login.spec.ts');
  assert.ok(impactPayload.affectedTests[0].score > 0);
  assert.ok(impactPayload.suggestedRunTargets.includes('tests/login.spec.ts'));
  assert.ok(impactPayload.suggestedPatches.length > 0);
  assert.equal(impactPayload.suggestedPatches[0].targetFile, 'tests/login.spec.ts');

  await writeFile(
    join(repoFixturePath, 'src', 'login-button.tsx'),
    `export function LoginButton() {\n  return <button className="primary-login-button">Log in</button>;\n}\n`,
    'utf8'
  );

  const gitImpactResult = await client.callTool({
    name: 'autoqa_impact_analysis',
    arguments: {
      repoPath: repoFixturePath,
      baseRef: 'HEAD',
      sampleLimit: 5,
    },
  });
  const gitImpactPayload = JSON.parse(extractText(gitImpactResult));
  assert.equal(gitImpactPayload.diffSource.mode, 'git');
  assert.equal(gitImpactPayload.diffSource.baseRef, 'HEAD');
  assert.ok(gitImpactPayload.changedFiles.includes('src/login-button.tsx'));
  assert.ok(gitImpactPayload.suggestedRunTargets.includes('tests/login.spec.ts'));
  assert.match(
    gitImpactPayload.suggestedPatches[0].reason,
    /selector rename .*login-button.*primary-login-button/i
  );
  assert.match(
    gitImpactPayload.suggestedPatches[0].patch.content,
    /getByRole\('button', \{ name: 'Log in' \}\)/
  );

  const semanticSuggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Update the affected login test after the latest UI diff.',
      baseRef: 'HEAD',
      sampleLimit: 5,
    },
  });
  const semanticSuggestPatchPayload = JSON.parse(extractText(semanticSuggestPatchResult));
  assert.equal(semanticSuggestPatchPayload.targetFile, 'tests/login.spec.ts');
  assert.match(
    semanticSuggestPatchPayload.reason,
    /text rename "Login" -> "Log in"/
  );
  assert.match(
    semanticSuggestPatchPayload.patch.content,
    /getByRole\('button', \{ name: 'Log in' \}\)/
  );

  const prSummaryResult = await client.callTool({
    name: 'autoqa_pr_summary',
    arguments: {
      repoPath: repoFixturePath,
      baseRef: 'HEAD',
      sampleLimit: 5,
    },
  });
  const prSummaryPayload = JSON.parse(extractText(prSummaryResult));
  assert.match(prSummaryPayload.title, /QA impact/i);
  assert.match(prSummaryPayload.body, /Highest-risk target: tests\/login\.spec\.ts/i);
  assert.ok(prSummaryPayload.changedFiles.includes('src/login-button.tsx'));
  assert.ok(prSummaryPayload.suggestedRunTargets.includes('tests/login.spec.ts'));

  const targetedRunPlanResult = await client.callTool({
    name: 'autoqa_targeted_run_plan',
    arguments: {
      repoPath: repoFixturePath,
      baseRef: 'HEAD',
      sampleLimit: 5,
    },
  });
  const targetedRunPlanPayload = JSON.parse(extractText(targetedRunPlanResult));
  assert.equal(targetedRunPlanPayload.diffSource.mode, 'git');
  assert.ok(Array.isArray(targetedRunPlanPayload.runGroups));
  assert.equal(targetedRunPlanPayload.runGroups[0].label, 'highest_priority');
  assert.ok(targetedRunPlanPayload.runGroups[0].tests.includes('tests/login.spec.ts'));
  assert.ok(Array.isArray(targetedRunPlanPayload.warningCodes));

  await execFileAsync('git', ['add', 'src/login-button.tsx'], { cwd: repoFixturePath });
  await execFileAsync('git', ['commit', '-m', 'update login button'], { cwd: repoFixturePath });

  const autoBaseImpactResult = await client.callTool({
    name: 'autoqa_impact_analysis',
    arguments: {
      repoPath: repoFixturePath,
      autoBase: true,
      sampleLimit: 5,
    },
  });
  const autoBaseImpactPayload = JSON.parse(extractText(autoBaseImpactResult));
  assert.equal(autoBaseImpactPayload.diffSource.mode, 'git');
  assert.equal(autoBaseImpactPayload.diffSource.autoBase, true);
  assert.equal(autoBaseImpactPayload.diffSource.compareRef, 'master');
  assert.ok(autoBaseImpactPayload.changedFiles.includes('src/login-button.tsx'));
  assert.ok(autoBaseImpactPayload.suggestedRunTargets.includes('tests/login.spec.ts'));

  const ciImpactCommand = await execFileAsync(process.execPath, [
    ciImpactScript,
    '--repo',
    repoFixturePath,
    '--auto-base',
    '--format',
    'plain',
  ]);
  assert.match(ciImpactCommand.stdout, /QA summary/);
  assert.match(ciImpactCommand.stdout, /Highest-risk test: tests\/login\.spec\.ts/);

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: [],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: [],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'suggest_only',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const suggestOnlyExecuteRunPlanResult = await client.callTool({
    name: 'autoqa_execute_run_plan',
    arguments: {
      repoPath: repoFixturePath,
      autoBase: true,
      maxTests: 2,
      sampleLimit: 5,
    },
  });
  const suggestOnlyExecuteRunPlanPayload = JSON.parse(extractText(suggestOnlyExecuteRunPlanResult));
  assert.equal(suggestOnlyExecuteRunPlanPayload.executed, false);
  assert.equal(suggestOnlyExecuteRunPlanPayload.status, 'skipped');
  assert.ok(suggestOnlyExecuteRunPlanPayload.blockedReasonCodes.includes('automation_mode_blocked'));
  assert.equal(suggestOnlyExecuteRunPlanPayload.policy.automationMode, 'suggest_only');

  await writeFile(
    join(repoFixturePath, 'autoqa.config.json'),
    `${JSON.stringify(
      {
        ignore: ['dist/**'],
        testDirectories: ['tests', 'qa-tests'],
        sourceDirectories: ['src'],
        policy: {
          patchAllow: ['tests/**', 'qa-tests/**'],
          patchDeny: [],
          protectedFiles: [],
          confidenceThresholds: {
            suggest: 0.55,
            apply: 0.85,
            verify: 0.6,
          },
          branch: {
            reportOnly: [],
          },
          testBudget: {
            maxTests: 3,
          },
          automation: {
            mode: 'guarded_apply',
            branchOverrides: [],
          },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await wait(3200);

  const executeRunPlanResult = await client.callTool({
    name: 'autoqa_execute_run_plan',
    arguments: {
      repoPath: repoFixturePath,
      autoBase: true,
      maxTests: 2,
      sampleLimit: 5,
    },
  });
  const executeRunPlanPayload = JSON.parse(extractText(executeRunPlanResult));
  assert.equal(executeRunPlanPayload.executed, true);
  assert.equal(executeRunPlanPayload.status, 'failed');
  assert.ok(executeRunPlanPayload.tests.includes('tests/login.spec.ts'));
  assert.equal(executeRunPlanPayload.policy.source, 'repo_config');
  assert.equal(executeRunPlanPayload.policy.maxTestsApplied, 2);
  assert.equal(executeRunPlanPayload.policy.automationMode, 'guarded_apply');

  const verifyPatchResult = await client.callTool({
    name: 'autoqa_verify_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Update the affected login test after the latest UI diff.',
      autoBase: true,
      maxTests: 2,
      sampleLimit: 5,
    },
  });
  const verifyPatchPayload = parseToolPayload(verifyPatchResult, 'autoqa_verify_patch');
  assert.equal(verifyPatchPayload.patch.applied, true);
  assert.equal(verifyPatchPayload.execution.status, 'passed');
  assert.equal(verifyPatchPayload.status, 'passed');
  assert.equal(verifyPatchPayload.artifacts[0]?.label, 'verification_report');
  assert.equal(verifyPatchPayload.artifacts[0]?.path, verifyPatchPayload.reportPath);
  assert.ok(Array.isArray(verifyPatchPayload.evidenceUsed));
  assert.equal(verifyPatchPayload.evidenceUsed.length, 0);
  assert.equal(verifyPatchPayload.policy.source, 'repo_config');
  assert.equal(verifyPatchPayload.policy.shouldVerify, true);
  assert.equal(verifyPatchPayload.policy.automationMode, 'guarded_apply');
  const verificationReport = await readFile(verifyPatchPayload.reportPath, 'utf8');
  assert.match(verificationReport, /AutoQA Patch Verification/);
  assert.match(verificationReport, /Status: passed/);
  assert.match(verificationReport, /## Evidence used/);
  assert.match(verificationReport, /## Policy/);
  const memoryPath = join(repoFixturePath, '.autoqa', 'state', 'memory.json');
  const memoryRaw = await readFile(memoryPath, 'utf8');
  const memoryJson = JSON.parse(memoryRaw);
  assert.equal(memoryJson.schemaVersion, 1);
  assert.equal(typeof memoryJson.repoFingerprint, 'string');
  assert.ok(Array.isArray(memoryJson.recentFailures));
  assert.ok(memoryJson.recentFailures.length > 0);
  assert.equal(memoryJson.recentFailures.at(-1).status, 'passed');
  assert.ok(Array.isArray(memoryJson.acceptedPatches));
  assert.ok(memoryJson.acceptedPatches.length > 0);
  assert.equal(memoryJson.acceptedPatches.at(-1).targetFile, 'tests/login.spec.ts');
  assert.ok(Array.isArray(memoryJson.acceptedPatches.at(-1).patterns));
  assert.ok(Array.isArray(memoryJson.patternStats));
  assert.ok(memoryJson.patternStats.length > 0);
  assert.ok(memoryJson.patternStats.some((entry) => entry.pattern === 'selector'));
  const metricsPath = join(repoFixturePath, '.autoqa', 'state', 'metrics.json');
  const metricsRaw = await readFile(metricsPath, 'utf8');
  const metricsJson = JSON.parse(metricsRaw);
  assert.equal(metricsJson.schemaVersion, 1);
  assert.ok(metricsJson.suggestions.attempted > 0);
  assert.ok(metricsJson.verify.total > 0);
  assert.ok(metricsJson.execution.total > 0);

  await writeFile(
    join(repoFixturePath, 'src', 'app.tsx'),
    `export function App() {\n  return <button className="primary-login-button">Log in</button>;\n}\n`,
    'utf8'
  );
  await writeFile(
    join(repoFixturePath, 'src', 'profile-link.tsx'),
    `export function ProfileLink() {\n  return <a href="/profile" aria-label="Profile" role="link">Profile</a>;\n}\n`,
    'utf8'
  );
  await writeFile(
    join(repoFixturePath, 'src', 'ignored.tsx'),
    `export const ignored = 'still ignore me';\n`,
    'utf8'
  );

  const workingTreeImpactResult = await client.callTool({
    name: 'autoqa_impact_analysis',
    arguments: {
      repoPath: repoFixturePath,
      workingTree: true,
      sampleLimit: 5,
    },
  });
  const workingTreeImpactPayload = JSON.parse(extractText(workingTreeImpactResult));
  assert.equal(workingTreeImpactPayload.diffSource.mode, 'working_tree');
  assert.equal(workingTreeImpactPayload.diffSource.staged, false);
  assert.ok(workingTreeImpactPayload.changedFiles.includes('src/app.tsx'));
  assert.ok(workingTreeImpactPayload.changedFiles.includes('src/profile-link.tsx'));
  assert.ok(!workingTreeImpactPayload.changedFiles.includes('src/ignored.tsx'));
  assert.ok(workingTreeImpactPayload.suggestedRunTargets.includes('tests/login.spec.ts'));

  const workingTreeSummaryResult = await client.callTool({
    name: 'autoqa_ci_summary',
    arguments: {
      repoPath: repoFixturePath,
      workingTree: true,
      format: 'github',
      sampleLimit: 5,
    },
  });
  const workingTreeSummaryPayload = JSON.parse(extractText(workingTreeSummaryResult));
  assert.equal(workingTreeSummaryPayload.diffSource.mode, 'working_tree');
  assert.match(workingTreeSummaryPayload.summary, /<!-- autoqa:pr-comment:v1 -->/);
  assert.match(workingTreeSummaryPayload.summary, /<!-- autoqa:pr-comment:block:start -->/);
  assert.match(workingTreeSummaryPayload.summary, /## AutoQA PR QA Report/);
  assert.match(workingTreeSummaryPayload.summary, /\*\*Mode:\*\* Working tree QA summary \(unstaged\)/);
  assert.match(workingTreeSummaryPayload.summary, /tests\/login\.spec\.ts/);
  assert.match(workingTreeSummaryPayload.summary, /<summary>Repo memory<\/summary>/);
  assert.match(workingTreeSummaryPayload.summary, /Memory confidence:/);
  assert.match(workingTreeSummaryPayload.summary, /<!-- autoqa:pr-comment:block:end -->/);
  assert.ok(workingTreeSummaryPayload.changedFiles.includes('src/app.tsx'));
  assert.ok(workingTreeSummaryPayload.changedFiles.includes('src/profile-link.tsx'));
  assert.ok(workingTreeSummaryPayload.memorySummary.failedRuns >= 0);
  assert.ok(workingTreeSummaryPayload.memorySummary.acceptedPatches > 0);
  assert.equal(typeof workingTreeSummaryPayload.memorySummary.confidenceHint, 'string');
  assert.equal(typeof workingTreeSummaryPayload.metricsSummary.acceptedSuggestionRate, 'number');
  assert.equal(typeof workingTreeSummaryPayload.metricsSummary.verifyPassRate, 'number');
  assert.ok(workingTreeSummaryPayload.metricsSummary.available);
  assert.ok(Array.isArray(workingTreeSummaryPayload.reasonCodes));

  await execFileAsync('git', ['add', 'src/app.tsx', 'src/profile-link.tsx'], { cwd: repoFixturePath });

  const stagedSummaryResult = await client.callTool({
    name: 'autoqa_ci_summary',
    arguments: {
      repoPath: repoFixturePath,
      workingTree: true,
      staged: true,
      format: 'plain',
      sampleLimit: 5,
    },
  });
  const stagedSummaryPayload = JSON.parse(extractText(stagedSummaryResult));
  assert.equal(stagedSummaryPayload.diffSource.mode, 'working_tree');
  assert.equal(stagedSummaryPayload.diffSource.staged, true);
  assert.match(stagedSummaryPayload.summary, /Working tree QA summary \(staged\)/);
  assert.match(stagedSummaryPayload.summary, /Run first: tests\/login\.spec\.ts/);
  assert.match(stagedSummaryPayload.summary, /Reason codes:/);
  assert.ok(stagedSummaryPayload.changedFiles.includes('src/profile-link.tsx'));

  const dryRunPatchResult = await client.callTool({
    name: 'autoqa_patch_file',
    arguments: {
      repoPath: repoFixturePath,
      filePath: 'src/app.tsx',
      action: 'replace',
      findText: 'className="primary-login-button"',
      content: 'data-testid="login-button"',
      expectedMatches: 1,
      dryRun: true,
    },
  });
  const dryRunPayload = JSON.parse(extractText(dryRunPatchResult));
  assert.equal(dryRunPayload.dryRun, true);
  assert.equal(dryRunPayload.changed, true);
  assert.match(dryRunPayload.diff, /--- a\/src\/app\.tsx/);
  assert.match(dryRunPayload.diff, /\+  return <button data-testid="login-button">Log in<\/button>;/);
  assert.equal(dryRunPayload.rollback.mode, 'replace_entire');
  assert.match(dryRunPayload.rollback.previousContent, /primary-login-button/);

  const unchangedAppFile = await readFile(join(repoFixturePath, 'src', 'app.tsx'), 'utf8');
  assert.match(unchangedAppFile, /className="primary-login-button"/);
  assert.doesNotMatch(unchangedAppFile, /data-testid="login-button"/);

  const appliedTestFile = await readFile(join(repoFixturePath, 'tests', 'login.spec.ts'), 'utf8');
  assert.match(appliedTestFile, /getByRole\('button', \{ name: 'Log in' \}\)/);

  const gatedSuggestPatchResult = await client.callTool({
    name: 'autoqa_suggest_patch',
    arguments: {
      repoPath: repoFixturePath,
      issue: 'Navigation timing issue after route changes. Add networkidle wait after page.goto.',
      apply: true,
      sampleLimit: 5,
    },
  });
  const gatedSuggestPatchPayload = JSON.parse(extractText(gatedSuggestPatchResult));
  assert.equal(gatedSuggestPatchPayload.applied, false);
  assert.equal(gatedSuggestPatchPayload.confidenceLevel, 'medium');
  assert.equal(gatedSuggestPatchPayload.patch.dryRun, true);
  assert.match(gatedSuggestPatchPayload.reason, /downgraded to dry-run/i);

  await execFileAsync('git', ['add', '.'], { cwd: repoFixturePath });
  await execFileAsync('git', ['commit', '-m', 'clean working tree for no-change summary'], {
    cwd: repoFixturePath,
  });

  const noChangesSummaryResult = await client.callTool({
    name: 'autoqa_ci_summary',
    arguments: {
      repoPath: repoFixturePath,
      workingTree: true,
      format: 'plain',
      sampleLimit: 5,
    },
  });
  const noChangesSummaryPayload = JSON.parse(extractText(noChangesSummaryResult));
  assert.equal(noChangesSummaryPayload.status, 'no_changes');
  assert.match(noChangesSummaryPayload.summary, /No changes detected/i);
  assert.match(noChangesSummaryPayload.summary, /Memory confidence:/i);
  assert.match(noChangesSummaryPayload.summary, /Metrics:/i);
  assert.match(noChangesSummaryPayload.summary, /Reason codes:/i);
  assert.ok(Array.isArray(noChangesSummaryPayload.reasonCodes));
  assert.ok(noChangesSummaryPayload.reasonCodes.includes('no_changes'));
  assert.equal(typeof noChangesSummaryPayload.metricsSummary.sampleCount, 'number');
  assert.equal(noChangesSummaryPayload.changedFiles.length, 0);

  console.log('MCP smoke test passed');
} finally {
  await transport.close().catch(() => undefined);
  if (repoFixturePath) {
    await rm(repoFixturePath, { recursive: true, force: true }).catch(() => undefined);
  }
  await rm(reportsDir, { recursive: true, force: true }).catch(() => undefined);
}
