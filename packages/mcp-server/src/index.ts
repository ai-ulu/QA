#!/usr/bin/env node

import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { dirname, join, resolve, sep } from 'path';
import { promisify } from 'util';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

type ConfidenceLevel = 'low' | 'medium' | 'high';

type ReportArtifact = {
  type: 'report';
  label: string;
  path: string;
};

type ToolEnvelope<T extends Record<string, unknown>> = T & {
  runId: string;
  toolName: string;
  generatedAt: string;
  repoPath: string | null;
  changedFiles: string[];
  confidenceLevel: ConfidenceLevel | null;
  status: string;
  artifacts: ReportArtifact[];
  result: T;
};

type ArtifactEvidenceKind =
  | 'selector_drift'
  | 'text_drift'
  | 'navigation_drift'
  | 'timing_issue'
  | 'auth_issue'
  | 'fixture_issue'
  | 'unknown';

type ArtifactEvidence = {
  source: 'error_context' | 'stderr' | 'stdout' | 'text';
  path: string;
  kind: ArtifactEvidenceKind;
  snippet: string;
};

type MemoryPatchRecord = {
  timestamp: string;
  issue: string;
  targetFile: string;
  confidenceLevel: ConfidenceLevel;
  applied: boolean;
  status: 'passed' | 'failed' | 'skipped';
  reason: string;
};

type MemoryFailureRecord = {
  timestamp: string;
  status: 'passed' | 'failed' | 'skipped';
  tests: string[];
  evidenceKinds: ArtifactEvidenceKind[];
};

type MemorySelectorHistoryEntry = {
  timestamp: string;
  from: string;
  to: string;
  sourceFile: string;
};

type AutoQaRepoMemory = {
  schemaVersion: 1;
  updatedAt: string;
  repoFingerprint: string;
  knownFlakyTests: string[];
  recentFailures: MemoryFailureRecord[];
  acceptedPatches: MemoryPatchRecord[];
  rejectedPatches: MemoryPatchRecord[];
  selectorHistory: MemorySelectorHistoryEntry[];
  routeHistory: MemorySelectorHistoryEntry[];
};

type RepoMemoryAdapter = {
  read(repoPath: string): Promise<{ memoryPath: string; memory: AutoQaRepoMemory; existed: boolean }>;
  write(repoPath: string, memoryPath: string, memory: AutoQaRepoMemory): Promise<void>;
};

type PolicyMode = 'auto' | 'report_only' | 'enforce';
type PolicySource = 'default' | 'repo_config' | 'cli_override';
type PolicyReasonCode =
  | 'not_in_allow_list'
  | 'matched_deny_rule'
  | 'protected_file'
  | 'branch_report_only'
  | 'below_apply_threshold'
  | 'below_verify_threshold'
  | 'test_budget_capped';

type PolicyTrace = {
  mode: PolicyMode;
  source: PolicySource;
  applyThreshold: number;
  verifyThreshold?: number;
  shouldApply?: boolean;
  shouldVerify?: boolean;
  maxTestsRequested?: number;
  maxTestsApplied?: number;
  blockedReasons: string[];
  blockedReasonCodes: PolicyReasonCode[];
};

type RepoMemorySummary = {
  knownFlakyTests: number;
  recentFailures: number;
  failedRuns: number;
  acceptedPatches: number;
  rejectedPatches: number;
  topFailingTests: Array<{
    file: string;
    count: number;
  }>;
};

const AUTOQA_PR_COMMENT_MARKER = '<!-- autoqa:pr-comment:v1 -->';
const AUTOQA_PR_COMMENT_BLOCK_START = '<!-- autoqa:pr-comment:block:start -->';
const AUTOQA_PR_COMMENT_BLOCK_END = '<!-- autoqa:pr-comment:block:end -->';

type RepoScanResult = {
  repoPath: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'unknown';
  frameworks: string[];
  playwrightConfigFiles: string[];
  testFileCount: number;
  sourceFileCount: number;
  sampleTestFiles: string[];
  sampleSourceFiles: string[];
  recommendedTargets: string[];
  notes: string[];
};

type PatchFileResult = {
  repoPath: string;
  filePath: string;
  action: 'replace' | 'append';
  dryRun: boolean;
  changed: boolean;
  matchCount: number;
  bytesDelta: number;
  preview: string;
  diff: string;
  rollback: {
    mode: 'replace_entire';
    filePath: string;
    previousContent: string;
    nextContent: string;
  };
};

type SuggestedPatch = {
  repoPath: string;
  targetFile: string;
  reason: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  applied: boolean;
  patch: {
    action: 'replace';
    findText: string;
    content: string;
    expectedMatches: number;
    dryRun: boolean;
  };
  diff: string;
  applyResult?: PatchFileResult;
  evidenceUsed: ArtifactEvidence[];
  blockedReasons: string[];
  blockedReasonCodes: PolicyReasonCode[];
  policy: PolicyTrace;
};

type SemanticReplacement = {
  kind: 'class' | 'testid' | 'text' | 'route' | 'href' | 'aria-label' | 'role';
  before: string;
  after: string;
};

type ImpactAnalysisResult = {
  repoPath: string;
  changedFiles: string[];
  diffSource: {
    mode: 'manual' | 'git' | 'working_tree';
    baseRef?: string;
    headRef?: string;
    staged?: boolean;
    autoBase?: boolean;
    compareRef?: string;
  };
  riskySourceFiles: string[];
  affectedTests: Array<{
    file: string;
    score: number;
    confidenceLevel: ConfidenceLevel;
    reasons: string[];
  }>;
  suggestedRunTargets: string[];
  suggestedPatches: SuggestedPatch[];
  confidenceLevel: ConfidenceLevel;
  summary: string;
};

type PullRequestSummary = {
  repoPath: string;
  title: string;
  body: string;
  affectedTests: string[];
  suggestedRunTargets: string[];
  changedFiles: string[];
};

type CiSummary = {
  repoPath: string;
  status: 'completed' | 'no_changes';
  format: 'markdown' | 'github' | 'plain';
  diffSource: {
    mode: 'manual' | 'git' | 'working_tree';
    baseRef?: string;
    headRef?: string;
    staged?: boolean;
    autoBase?: boolean;
    compareRef?: string;
  };
  summary: string;
  affectedTests: string[];
  suggestedRunTargets: string[];
  changedFiles: string[];
  memorySummary: RepoMemorySummary;
};

type TargetedRunPlan = {
  repoPath: string;
  changedFiles: string[];
  diffSource: {
    mode: 'manual' | 'git' | 'working_tree';
    baseRef?: string;
    headRef?: string;
    staged?: boolean;
    autoBase?: boolean;
    compareRef?: string;
  };
  runGroups: Array<{
    label: 'highest_priority' | 'secondary' | 'manual_review';
    tests: string[];
    rationale: string;
  }>;
  confidenceLevel: ConfidenceLevel;
  warnings: string[];
};

type RunPlanExecution = {
  repoPath: string;
  command: string[];
  tests: string[];
  executed: boolean;
  exitCode: number;
  status: 'passed' | 'failed' | 'skipped';
  stdout: string;
  stderr: string;
  blockedReasons: string[];
  blockedReasonCodes: PolicyReasonCode[];
  policy: PolicyTrace;
};

type PatchVerification = {
  repoPath: string;
  patch: SuggestedPatch;
  runPlan: TargetedRunPlan;
  execution: RunPlanExecution;
  reportPath: string;
  status: 'passed' | 'failed' | 'skipped';
  evidenceUsed: ArtifactEvidence[];
  blockedReasons: string[];
  blockedReasonCodes: PolicyReasonCode[];
  policy: PolicyTrace;
};

type RepoSettings = {
  ignorePatterns: string[];
  testDirectories: string[];
  sourceDirectories: string[];
  policy: RepoPolicy;
  policySource: Exclude<PolicySource, 'cli_override'>;
};

type RepoPolicy = {
  patchAllow: string[];
  patchDeny: string[];
  protectedFiles: string[];
  confidenceThresholds: {
    suggest: number;
    apply: number;
    verify: number;
  };
  branch: {
    reportOnly: string[];
  };
  testBudget: {
    maxTests: number;
  };
};

type DiffSignal = {
  file: string;
  addedLines: string[];
  removedLines: string[];
  changeTypes: string[];
  semanticReplacements: SemanticReplacement[];
};

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.dogfood',
  'node_modules',
  'dist',
  'coverage',
  '.next',
  '.turbo',
  '.tmp-fixtures',
  'playwright-report',
  'reports',
  'test-results',
]);

const TEST_FILE_PATTERN = /(^|[/\\])(tests?|e2e|specs?)([/\\].+)?$|(\.test|\.spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };
const CACHE_TTL_MS = 3000;
const MEMORY_SCHEMA_VERSION = 1;
const MEMORY_MAX_RECENT_FAILURES = 50;
const MEMORY_MAX_ACCEPTED_PATCHES = 80;
const MEMORY_MAX_REJECTED_PATCHES = 80;
const MEMORY_MAX_SELECTOR_HISTORY = 120;
const MEMORY_MAX_ROUTE_HISTORY = 120;

const repoSettingsCache = new Map<string, { expiresAt: number; value: RepoSettings }>();
const repoFileCache = new Map<string, { expiresAt: number; value: string[] }>();
const diffSignalCache = new Map<string, { expiresAt: number; value: DiffSignal[] }>();

const server = new Server(
  {
    name: 'autoqa-mcp-server',
    version: packageJson.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const ScanRepoSchema = z.object({
  repoPath: z.string().min(1),
  sampleLimit: z.number().int().min(1).max(50).default(10),
});

const PatchFileSchema = z.object({
  repoPath: z.string().min(1),
  filePath: z.string().min(1),
  action: z.enum(['replace', 'append']).default('replace'),
  findText: z.string().optional(),
  content: z.string(),
  expectedMatches: z.number().int().min(0).default(1),
  dryRun: z.boolean().default(false),
});

const SuggestPatchSchema = z.object({
  repoPath: z.string().min(1),
  issue: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).min(1).optional(),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1).optional(),
  workingTree: z.boolean().default(false),
  staged: z.boolean().default(false),
  autoBase: z.boolean().default(false),
  apply: z.boolean().default(false),
  reportDir: z.string().min(1).optional(),
  artifactPaths: z.array(z.string().min(1)).min(1).optional(),
  policyMode: z.enum(['auto', 'report_only', 'enforce']).default('auto'),
  applyThresholdOverride: z.number().min(0).max(1).optional(),
  sampleLimit: z.number().int().min(1).max(20).default(10),
}).refine(
  (value) =>
    !(value.changedFiles?.length || value.baseRef || value.workingTree || value.autoBase) ||
    Boolean(value.changedFiles?.length) ||
    Boolean(value.baseRef) ||
    value.workingTree ||
    value.autoBase,
  'Provide changedFiles, baseRef, workingTree, or autoBase when supplying diff context'
);

const ImpactAnalysisSchema = z.object({
  repoPath: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).min(1).optional(),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1).optional(),
  workingTree: z.boolean().default(false),
  staged: z.boolean().default(false),
  autoBase: z.boolean().default(false),
  sampleLimit: z.number().int().min(1).max(20).default(10),
}).refine(
  (value) =>
    Boolean(value.changedFiles?.length) || Boolean(value.baseRef) || value.workingTree || value.autoBase,
  'Provide changedFiles, baseRef, workingTree, or autoBase for impact analysis'
);

const PullRequestSummarySchema = z.object({
  repoPath: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).min(1).optional(),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1).optional(),
  workingTree: z.boolean().default(false),
  staged: z.boolean().default(false),
  autoBase: z.boolean().default(false),
  sampleLimit: z.number().int().min(1).max(20).default(10),
}).refine(
  (value) =>
    Boolean(value.changedFiles?.length) || Boolean(value.baseRef) || value.workingTree || value.autoBase,
  'Provide changedFiles, baseRef, workingTree, or autoBase for PR summary'
);

const TargetedRunPlanSchema = z.object({
  repoPath: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).min(1).optional(),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1).optional(),
  workingTree: z.boolean().default(false),
  staged: z.boolean().default(false),
  autoBase: z.boolean().default(false),
  sampleLimit: z.number().int().min(1).max(20).default(10),
}).refine(
  (value) =>
    Boolean(value.changedFiles?.length) || Boolean(value.baseRef) || value.workingTree || value.autoBase,
  'Provide changedFiles, baseRef, workingTree, or autoBase for targeted run planning'
);

const CiSummarySchema = z.object({
  repoPath: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).min(1).optional(),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1).optional(),
  workingTree: z.boolean().default(false),
  staged: z.boolean().default(false),
  autoBase: z.boolean().default(false),
  format: z.enum(['markdown', 'github', 'plain']).default('markdown'),
  sampleLimit: z.number().int().min(1).max(20).default(10),
}).refine(
  (value) =>
    Boolean(value.changedFiles?.length) || Boolean(value.baseRef) || value.workingTree || value.autoBase,
  'Provide changedFiles, baseRef, workingTree, or autoBase for CI summary'
);

const ExecuteRunPlanSchema = z.object({
  repoPath: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).min(1).optional(),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1).optional(),
  workingTree: z.boolean().default(false),
  staged: z.boolean().default(false),
  autoBase: z.boolean().default(false),
  policyMode: z.enum(['auto', 'report_only', 'enforce']).default('auto'),
  maxTests: z.number().int().min(1).max(20).default(5),
  sampleLimit: z.number().int().min(1).max(20).default(10),
}).refine(
  (value) =>
    Boolean(value.changedFiles?.length) || Boolean(value.baseRef) || value.workingTree || value.autoBase,
  'Provide changedFiles, baseRef, workingTree, or autoBase for run plan execution'
);

const VerifyPatchSchema = z.object({
  repoPath: z.string().min(1),
  issue: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).min(1).optional(),
  baseRef: z.string().min(1).optional(),
  headRef: z.string().min(1).optional(),
  workingTree: z.boolean().default(false),
  staged: z.boolean().default(false),
  autoBase: z.boolean().default(false),
  reportDir: z.string().min(1).optional(),
  artifactPaths: z.array(z.string().min(1)).min(1).optional(),
  policyMode: z.enum(['auto', 'report_only', 'enforce']).default('auto'),
  applyThresholdOverride: z.number().min(0).max(1).optional(),
  verifyThresholdOverride: z.number().min(0).max(1).optional(),
  maxTests: z.number().int().min(1).max(20).default(5),
  sampleLimit: z.number().int().min(1).max(20).default(10),
}).refine(
  (value) =>
    Boolean(value.changedFiles?.length) || Boolean(value.baseRef) || value.workingTree || value.autoBase,
  'Provide changedFiles, baseRef, workingTree, or autoBase for patch verification'
);

const tools: Tool[] = [
  {
    name: 'autoqa_scan_repo',
    description:
      'Inspect a repository, detect Playwright-relevant files, and suggest the best patch targets.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        sampleLimit: { type: 'number', default: 10 },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'autoqa_patch_file',
    description:
      'Safely patch a text file inside a repository using exact-match replacement or append mode.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        filePath: { type: 'string' },
        action: { type: 'string', enum: ['replace', 'append'], default: 'replace' },
        findText: { type: 'string' },
        content: { type: 'string' },
        expectedMatches: { type: 'number', default: 1 },
        dryRun: { type: 'boolean', default: false },
      },
      required: ['repoPath', 'filePath', 'content'],
    },
  },
  {
    name: 'autoqa_suggest_patch',
    description:
      'Propose a safe dry-run patch for a repository file based on a failure, maintenance issue, or git diff context.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        issue: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        baseRef: { type: 'string' },
        headRef: { type: 'string' },
        workingTree: { type: 'boolean', default: false },
        staged: { type: 'boolean', default: false },
        autoBase: { type: 'boolean', default: false },
        apply: { type: 'boolean', default: false },
        policyMode: { type: 'string', enum: ['auto', 'report_only', 'enforce'], default: 'auto' },
        applyThresholdOverride: { type: 'number' },
        sampleLimit: { type: 'number', default: 10 },
      },
      required: ['repoPath', 'issue'],
    },
  },
  {
    name: 'autoqa_impact_analysis',
    description:
      'Map changed repository files to likely affected tests, run targets, and candidate maintenance patches.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        baseRef: { type: 'string' },
        headRef: { type: 'string' },
        workingTree: { type: 'boolean', default: false },
        staged: { type: 'boolean', default: false },
        autoBase: { type: 'boolean', default: false },
        sampleLimit: { type: 'number', default: 10 },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'autoqa_pr_summary',
    description:
      'Turn a repository diff into a concise PR-style QA maintenance summary with affected tests and patch guidance.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        baseRef: { type: 'string' },
        headRef: { type: 'string' },
        workingTree: { type: 'boolean', default: false },
        staged: { type: 'boolean', default: false },
        autoBase: { type: 'boolean', default: false },
        sampleLimit: { type: 'number', default: 10 },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'autoqa_targeted_run_plan',
    description:
      'Create a prioritized test execution plan from a repository diff or changed file list.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        baseRef: { type: 'string' },
        headRef: { type: 'string' },
        workingTree: { type: 'boolean', default: false },
        staged: { type: 'boolean', default: false },
        autoBase: { type: 'boolean', default: false },
        sampleLimit: { type: 'number', default: 10 },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'autoqa_ci_summary',
    description:
      'Create a CI-friendly QA summary from a repository diff, PR diff, or working tree changes.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        baseRef: { type: 'string' },
        headRef: { type: 'string' },
        workingTree: { type: 'boolean', default: false },
        staged: { type: 'boolean', default: false },
        autoBase: { type: 'boolean', default: false },
        format: { type: 'string', enum: ['markdown', 'github', 'plain'], default: 'markdown' },
        sampleLimit: { type: 'number', default: 10 },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'autoqa_execute_run_plan',
    description:
      'Resolve a targeted Playwright run plan from repository changes and execute the selected tests.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        baseRef: { type: 'string' },
        headRef: { type: 'string' },
        workingTree: { type: 'boolean', default: false },
        staged: { type: 'boolean', default: false },
        autoBase: { type: 'boolean', default: false },
        policyMode: { type: 'string', enum: ['auto', 'report_only', 'enforce'], default: 'auto' },
        maxTests: { type: 'number', default: 5 },
        sampleLimit: { type: 'number', default: 10 },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'autoqa_verify_patch',
    description:
      'Apply a high-confidence patch, execute the targeted Playwright run plan, and write a verification report.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        issue: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        baseRef: { type: 'string' },
        headRef: { type: 'string' },
        workingTree: { type: 'boolean', default: false },
        staged: { type: 'boolean', default: false },
        autoBase: { type: 'boolean', default: false },
        policyMode: { type: 'string', enum: ['auto', 'report_only', 'enforce'], default: 'auto' },
        applyThresholdOverride: { type: 'number' },
        verifyThresholdOverride: { type: 'number' },
        maxTests: { type: 'number', default: 5 },
        sampleLimit: { type: 'number', default: 10 },
      },
      required: ['repoPath', 'issue'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'autoqa_scan_repo': {
        const { repoPath, sampleLimit } = ScanRepoSchema.parse(args);
        const result = await scanRepo(repoPath, sampleLimit);
        return jsonResult('autoqa_scan_repo', result);
      }

      case 'autoqa_patch_file': {
        const payload = PatchFileSchema.parse(args);
        const result = await patchFile(payload);
        return jsonResult('autoqa_patch_file', result);
      }

      case 'autoqa_suggest_patch': {
        const payload = SuggestPatchSchema.parse(args);
        const result = await suggestPatch(
          payload.repoPath,
          payload.issue,
          payload.sampleLimit,
          payload.changedFiles,
          payload.baseRef,
          payload.headRef,
          payload.workingTree,
          payload.staged,
          payload.autoBase,
          payload.apply,
          payload.reportDir,
          payload.artifactPaths,
          payload.policyMode,
          payload.applyThresholdOverride
        );
        return jsonResult('autoqa_suggest_patch', result);
      }

      case 'autoqa_impact_analysis': {
        const payload = ImpactAnalysisSchema.parse(args);
        const result = await analyzeImpact(
          payload.repoPath,
          payload.changedFiles,
          payload.baseRef,
          payload.headRef,
          payload.workingTree,
          payload.staged,
          payload.autoBase,
          payload.sampleLimit
        );
        return jsonResult('autoqa_impact_analysis', result);
      }

      case 'autoqa_pr_summary': {
        const payload = PullRequestSummarySchema.parse(args);
        const result = await buildPullRequestSummary(
          payload.repoPath,
          payload.changedFiles,
          payload.baseRef,
          payload.headRef,
          payload.workingTree,
          payload.staged,
          payload.autoBase,
          payload.sampleLimit
        );
        return jsonResult('autoqa_pr_summary', result);
      }

      case 'autoqa_targeted_run_plan': {
        const payload = TargetedRunPlanSchema.parse(args);
        const result = await buildTargetedRunPlan(
          payload.repoPath,
          payload.changedFiles,
          payload.baseRef,
          payload.headRef,
          payload.workingTree,
          payload.staged,
          payload.autoBase,
          payload.sampleLimit
        );
        return jsonResult('autoqa_targeted_run_plan', result);
      }

      case 'autoqa_execute_run_plan': {
        const payload = ExecuteRunPlanSchema.parse(args);
        const result = await executeRunPlan(
          payload.repoPath,
          payload.changedFiles,
          payload.baseRef,
          payload.headRef,
          payload.workingTree,
          payload.staged,
          payload.autoBase,
          payload.policyMode,
          payload.maxTests,
          payload.sampleLimit
        );
        return jsonResult('autoqa_execute_run_plan', result);
      }

      case 'autoqa_verify_patch': {
        const payload = VerifyPatchSchema.parse(args);
        const result = await verifyPatch(
          payload.repoPath,
          payload.issue,
          payload.changedFiles,
          payload.baseRef,
          payload.headRef,
          payload.workingTree,
          payload.staged,
          payload.autoBase,
          payload.maxTests,
          payload.sampleLimit,
          payload.reportDir,
          payload.artifactPaths,
          payload.policyMode,
          payload.applyThresholdOverride,
          payload.verifyThresholdOverride
        );
        return jsonResult('autoqa_verify_patch', result);
      }

      case 'autoqa_ci_summary': {
        const payload = CiSummarySchema.parse(args);
        const result = await buildCiSummary(
          payload.repoPath,
          payload.changedFiles,
          payload.baseRef,
          payload.headRef,
          payload.workingTree,
          payload.staged,
          payload.autoBase,
          payload.format,
          payload.sampleLimit
        );
        return jsonResult('autoqa_ci_summary', result);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

function textResult(text: string) {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

function jsonResult<T extends Record<string, unknown>>(toolName: string, payload: T) {
  return textResult(`${JSON.stringify(buildToolEnvelope(toolName, payload), null, 2)}\n`);
}

function buildToolEnvelope<T extends Record<string, unknown>>(
  toolName: string,
  payload: T
): ToolEnvelope<T> {
  const runId = createRunId();

  return {
    ...payload,
    runId,
    toolName,
    generatedAt: new Date().toISOString(),
    repoPath: readRepoPath(payload),
    changedFiles: readChangedFiles(payload),
    confidenceLevel: readConfidenceLevel(payload),
    status: readStatus(payload),
    artifacts: readArtifacts(payload),
    result: payload,
  };
}

function createRunId() {
  return `autoqa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readRepoPath(payload: Record<string, unknown>) {
  return typeof payload.repoPath === 'string' ? payload.repoPath : null;
}

function readChangedFiles(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.changedFiles)) {
    return [];
  }

  return payload.changedFiles.filter((entry): entry is string => typeof entry === 'string');
}

function readConfidenceLevel(payload: Record<string, unknown>) {
  const value = payload.confidenceLevel;
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function readStatus(payload: Record<string, unknown>) {
  if (typeof payload.status === 'string' && payload.status.length > 0) {
    return payload.status;
  }

  if (typeof payload.changed === 'boolean') {
    return payload.changed ? 'changed' : 'unchanged';
  }

  return 'completed';
}

function readArtifacts(payload: Record<string, unknown>): ReportArtifact[] {
  const artifacts: ReportArtifact[] = [];

  if (typeof payload.reportPath === 'string' && payload.reportPath.length > 0) {
    artifacts.push({
      type: 'report',
      label: 'verification_report',
      path: payload.reportPath,
    });
  }

  return artifacts;
}

async function scanRepo(repoPath: string, sampleLimit: number): Promise<RepoScanResult> {
  const absoluteRepoPath = await resolveDirectoryPath(repoPath);
  const settings = await loadRepoSettings(absoluteRepoPath);
  const files = await listRepositoryFiles(absoluteRepoPath, settings);

  const packageManager = detectPackageManager(files);
  const packageJson = await readPackageJsonIfPresent(absoluteRepoPath, files);
  const frameworks = detectFrameworks(files, packageJson);
  const playwrightConfigFiles = files.filter((file) =>
    /(^|[/\\])playwright\.config\.(ts|js|mjs|cjs)$/i.test(file)
  );
  const testFiles = files.filter((file) => isConfiguredTestFile(file, settings));
  const sourceFiles = files.filter((file) => isConfiguredSourceFile(file, settings));

  const notes: string[] = [];
  if (!playwrightConfigFiles.length) {
    notes.push('No Playwright config file found.');
  }
  if (!testFiles.length) {
    notes.push('No test files found. Create a seed spec before relying on patch workflows.');
  }
  if (!frameworks.length) {
    notes.push('No supported test framework detected from package.json or file layout.');
  }
  if (settings.ignorePatterns.length > 0) {
    notes.push(`Loaded ${settings.ignorePatterns.length} ignore pattern(s) from repo settings.`);
  }

  const recommendedTargets = [
    ...testFiles,
    ...playwrightConfigFiles,
    ...(files.includes('package.json') ? ['package.json'] : []),
  ].slice(0, sampleLimit);

  return {
    repoPath: absoluteRepoPath,
    packageManager,
    frameworks,
    playwrightConfigFiles: playwrightConfigFiles.slice(0, sampleLimit),
    testFileCount: testFiles.length,
    sourceFileCount: sourceFiles.length,
    sampleTestFiles: testFiles.slice(0, sampleLimit),
    sampleSourceFiles: sourceFiles.slice(0, sampleLimit),
    recommendedTargets,
    notes,
  };
}

async function patchFile(input: z.infer<typeof PatchFileSchema>): Promise<PatchFileResult> {
  const repoPath = await resolveDirectoryPath(input.repoPath);
  const absoluteFilePath = resolveRepoRelativePath(repoPath, input.filePath);

  let current = '';
  let existed = false;

  try {
    current = await readFile(absoluteFilePath, 'utf8');
    existed = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  let next = current;
  let matchCount = 0;

  if (input.action === 'replace') {
    if (!input.findText) {
      throw new Error('findText is required for replace patches');
    }

    matchCount = countOccurrences(current, input.findText);
    if (matchCount !== input.expectedMatches) {
      throw new Error(
        `Expected ${input.expectedMatches} matches for replace patch, found ${matchCount}`
      );
    }

    next = current.split(input.findText).join(input.content);
  } else {
    if (!existed) {
      await mkdir(dirname(absoluteFilePath), { recursive: true });
      next = input.content;
    } else {
      const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
      next = `${current}${separator}${input.content}`;
    }
  }

  if (!input.dryRun) {
    await mkdir(dirname(absoluteFilePath), { recursive: true });
    await writeFile(absoluteFilePath, next, 'utf8');
  }

  const diff = buildUnifiedDiff(input.filePath, current, next);

  return {
    repoPath,
    filePath: input.filePath,
    action: input.action,
    dryRun: input.dryRun,
    changed: current !== next,
    matchCount,
    bytesDelta: Buffer.byteLength(next, 'utf8') - Buffer.byteLength(current, 'utf8'),
    preview: buildPreview(next),
    diff,
    rollback: {
      mode: 'replace_entire',
      filePath: input.filePath,
      previousContent: current,
      nextContent: next,
    },
  };
}

async function suggestPatch(
  repoPath: string,
  issue: string,
  sampleLimit: number,
  changedFiles?: string[],
  baseRef?: string,
  headRef?: string,
  workingTree?: boolean,
  staged?: boolean,
  autoBase?: boolean,
  apply?: boolean,
  reportDir?: string,
  artifactPaths?: string[],
  policyMode: PolicyMode = 'auto',
  applyThresholdOverride?: number
): Promise<SuggestedPatch> {
  const scan = await scanRepo(repoPath, Math.max(sampleLimit, 30));
  const settings = await loadRepoSettings(scan.repoPath);
  const branchName = await readCurrentBranch(scan.repoPath);
  const policySource = resolvePolicySource(settings, policyMode, {
    applyThresholdOverride,
  });
  const memory = (await readRepoMemory(scan.repoPath)).memory;
  const issueLower = issue.toLowerCase();
  const artifactEvidence = await collectArtifactEvidence(scan.repoPath, reportDir, artifactPaths);
  const issueWithEvidence = artifactEvidence.length
    ? `${issueLower} ${artifactEvidence.map((item) => item.kind).join(' ')}`
    : issueLower;
  const resolvedChanges =
    changedFiles?.length || baseRef || workingTree || autoBase
      ? await resolveChangedFiles(
          scan.repoPath,
          changedFiles,
          baseRef,
          headRef,
          workingTree,
          staged,
          autoBase
        )
      : null;
  const diffSignals = resolvedChanges
    ? await loadDiffSignals(
        scan.repoPath,
        resolvedChanges.changedFiles,
        resolvedChanges.diffSource.mode === 'git' ? resolvedChanges.diffSource.baseRef : undefined,
        resolvedChanges.diffSource.mode === 'git' ? resolvedChanges.diffSource.headRef : undefined,
        resolvedChanges.diffSource.mode === 'working_tree',
        resolvedChanges.diffSource.mode === 'working_tree' ? resolvedChanges.diffSource.staged : false,
        resolvedChanges.untrackedFiles
      )
    : [];
  const preferredTargets = scan.sampleTestFiles.length
    ? scan.sampleTestFiles
    : scan.recommendedTargets.filter((item) => TEST_FILE_PATTERN.test(item));
  const changedTestTargets = resolvedChanges
    ? resolvedChanges.changedFiles.filter((item) => TEST_FILE_PATTERN.test(item))
    : [];
  const candidateTargets = dedupeStrings([...changedTestTargets, ...preferredTargets]);

  if (!candidateTargets.length) {
    throw new Error('No candidate test file found for patch suggestion');
  }

  const rankedTargets = resolvedChanges
    ? await rankPatchTargets(
        scan.repoPath,
        candidateTargets,
        resolvedChanges.changedFiles,
        diffSignals,
        memory,
        issueLower
      )
    : candidateTargets;

  for (const relativeTarget of rankedTargets) {
    const absoluteTarget = resolveRepoRelativePath(scan.repoPath, relativeTarget);
    const content = await readFile(absoluteTarget, 'utf8');
    const proposal =
      buildSemanticPatchProposal(content, diffSignals, issueWithEvidence) ??
      buildPatchProposal(content, issueWithEvidence, issue);

    if (!proposal) {
      continue;
    }

    const confidenceWithEvidence = adjustConfidenceWithEvidence(proposal.confidence, artifactEvidence);
    const thresholdedConfidence =
      confidenceWithEvidence >= settings.policy.confidenceThresholds.suggest
        ? confidenceWithEvidence
        : Math.max(confidenceWithEvidence - 0.05, 0);
    const confidenceLevel = confidenceLevelFromValue(confidenceWithEvidence);
    const policyDecision = evaluatePatchPolicy(
      settings.policy,
      relativeTarget,
      thresholdedConfidence,
      Boolean(apply),
      branchName,
      policyMode,
      applyThresholdOverride
    );
    const shouldApply = policyDecision.shouldApply;
    const gatedReason = shouldApply
      ? proposal.reason
      : apply
        ? `${proposal.reason} Apply request downgraded to dry-run.`
        : proposal.reason;
    const policyReason =
      policyDecision.blockedReasons.length > 0
        ? `${gatedReason} Blocked by policy: ${policyDecision.blockedReasons.join('; ')}.`
        : gatedReason;
    const evidenceReason =
      artifactEvidence.length > 0
        ? `${policyReason} Artifact evidence: ${artifactEvidence.map((item) => item.kind).join(', ')}.`
        : policyReason;

    const patchPreview = await patchFile({
      repoPath: scan.repoPath,
      filePath: relativeTarget,
      action: 'replace',
      findText: proposal.findText,
      content: proposal.content,
      expectedMatches: 1,
      dryRun: !shouldApply,
    });

    return {
      repoPath: scan.repoPath,
      targetFile: relativeTarget,
      reason: evidenceReason,
      confidence: confidenceWithEvidence,
      confidenceLevel,
      applied: shouldApply,
      patch: {
        action: 'replace',
        findText: proposal.findText,
        content: proposal.content,
        expectedMatches: 1,
        dryRun: !shouldApply,
      },
      diff: patchPreview.diff,
      applyResult: shouldApply ? patchPreview : undefined,
      evidenceUsed: artifactEvidence,
      blockedReasons: policyDecision.blockedReasons,
      blockedReasonCodes: policyDecision.blockedReasonCodes,
      policy: {
        mode: policyDecision.mode,
        source: policySource,
        applyThreshold: policyDecision.applyThreshold,
        shouldApply: policyDecision.shouldApply,
        blockedReasons: policyDecision.blockedReasons,
        blockedReasonCodes: policyDecision.blockedReasonCodes,
      },
    };
  }

  throw new Error('Could not derive a patch suggestion from the current repository snapshot');
}

async function rankPatchTargets(
  repoPath: string,
  targets: string[],
  changedFiles: string[],
  diffSignals: DiffSignal[],
  memory: AutoQaRepoMemory | null = null,
  issueHint: string = ''
) {
  const scoredTargets = await Promise.all(
    targets.map(async (target) => {
      const absoluteTarget = resolveRepoRelativePath(repoPath, target);
      const content = await readFile(absoluteTarget, 'utf8').catch(() => '');
      const scoreDetails = scoreTestAgainstChanges(target, changedFiles, diffSignals, content);
      const directMatchBoost = changedFiles.includes(target) ? 20 : 0;
      const acceptedHitCount = memory
        ? memory.acceptedPatches.filter((entry) => entry.targetFile === target).length
        : 0;
      const rejectedHitCount = memory
        ? memory.rejectedPatches.filter((entry) => entry.targetFile === target).length
        : 0;
      const acceptedBoost = Math.min(acceptedHitCount * 8, 24);
      const rejectedPenalty = Math.min(rejectedHitCount * 4, 12);
      const selectorHistoryBoost =
        memory &&
        issueHint.includes('selector') &&
        memory.selectorHistory.some((entry) => entry.sourceFile === target)
          ? 6
          : 0;
      return {
        target,
        score:
          scoreDetails.score +
          directMatchBoost +
          acceptedBoost +
          selectorHistoryBoost -
          rejectedPenalty,
      };
    })
  );

  return scoredTargets
    .sort((left, right) => right.score - left.score || left.target.localeCompare(right.target))
    .map((entry) => entry.target);
}

function applyMemoryBoostToAffectedTests(
  affectedTests: Array<{ file: string; score: number; confidenceLevel: ConfidenceLevel; reasons: string[] }>,
  memory: AutoQaRepoMemory
) {
  const failedFailureRecords = memory.recentFailures.filter((entry) => entry.status === 'failed');
  const failureCounts = new Map<string, number>();

  for (const record of failedFailureRecords) {
    for (const testFile of record.tests) {
      failureCounts.set(testFile, (failureCounts.get(testFile) ?? 0) + 1);
    }
  }

  return affectedTests
    .map((entry) => {
      const failureCount = failureCounts.get(entry.file) ?? 0;
      if (failureCount <= 0) {
        return entry;
      }

      const memoryBoost = Math.min(20, failureCount * 4);
      return {
        ...entry,
        score: entry.score + memoryBoost,
        confidenceLevel: confidenceLevelFromScore(entry.score + memoryBoost),
        reasons: dedupeStrings([
          ...entry.reasons,
          `memory boost: ${failureCount} previous failed run(s)`,
        ]),
      };
    })
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file));
}

async function analyzeImpact(
  repoPath: string,
  changedFiles: string[] | undefined,
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean | undefined,
  staged: boolean | undefined,
  autoBase: boolean | undefined,
  sampleLimit: number
): Promise<ImpactAnalysisResult> {
  const resolvedChanges = await resolveChangedFiles(
    repoPath,
    changedFiles,
    baseRef,
    headRef,
    workingTree,
    staged,
    autoBase
  );
  const scan = await scanRepo(repoPath, Math.max(sampleLimit, resolvedChanges.changedFiles.length));
  const memory = (await readRepoMemory(scan.repoPath)).memory;
  const normalizedChangedFiles = resolvedChanges.changedFiles;
  const riskySourceFiles = normalizedChangedFiles.filter((file) => !TEST_FILE_PATTERN.test(file));
  const diffSignals = await loadDiffSignals(
    scan.repoPath,
    normalizedChangedFiles,
    resolvedChanges.diffSource.mode === 'git' ? resolvedChanges.diffSource.baseRef : undefined,
    resolvedChanges.diffSource.mode === 'git' ? resolvedChanges.diffSource.headRef : undefined,
    resolvedChanges.diffSource.mode === 'working_tree',
    resolvedChanges.diffSource.mode === 'working_tree' ? resolvedChanges.diffSource.staged : false,
    resolvedChanges.untrackedFiles
  );

  const affectedTests = scan.sampleTestFiles
    .map(async (testFile) => {
      const absoluteTestPath = resolveRepoRelativePath(scan.repoPath, testFile);
      const testContent = await readFile(absoluteTestPath, 'utf8').catch(() => '');
      const scoreDetails = scoreTestAgainstChanges(
        testFile,
        normalizedChangedFiles,
        diffSignals,
        testContent
      );
      return {
        file: testFile,
        score: scoreDetails.score,
        confidenceLevel: confidenceLevelFromScore(scoreDetails.score),
        reasons: scoreDetails.reasons,
      };
    })
    .reduce(async (promise, entryPromise) => {
      const items = await promise;
      items.push(await entryPromise);
      return items;
    }, Promise.resolve([] as Array<{ file: string; score: number; confidenceLevel: ConfidenceLevel; reasons: string[] }>));

  const resolvedAffectedTestsRaw = (await affectedTests)
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file))
    .slice(0, sampleLimit);
  const resolvedAffectedTests = applyMemoryBoostToAffectedTests(
    resolvedAffectedTestsRaw,
    memory
  ).slice(0, sampleLimit);

  const patchInputs = derivePatchIssuesFromChanges(normalizedChangedFiles, diffSignals).slice(
    0,
    sampleLimit
  );
  const suggestedPatches: SuggestedPatch[] = [];

  for (const issue of patchInputs) {
    try {
      const suggestion = await suggestPatch(
        scan.repoPath,
        issue,
        sampleLimit,
        normalizedChangedFiles,
        resolvedChanges.diffSource.mode === 'git' ? resolvedChanges.diffSource.baseRef : undefined,
        resolvedChanges.diffSource.mode === 'git' ? resolvedChanges.diffSource.headRef : undefined,
        resolvedChanges.diffSource.mode === 'working_tree',
        resolvedChanges.diffSource.mode === 'working_tree' ? resolvedChanges.diffSource.staged : false,
        Boolean(resolvedChanges.diffSource.autoBase)
      );
      if (!suggestedPatches.some((item) => item.targetFile === suggestion.targetFile)) {
        suggestedPatches.push(suggestion);
      }
    } catch {
      // Ignore patch derivation misses; impact analysis should still return test targeting.
    }
  }

  const summary =
    resolvedAffectedTests.length > 0
      ? `Detected ${resolvedAffectedTests.length} likely affected test target(s) from ${normalizedChangedFiles.length} changed file(s).`
      : `No direct affected tests were inferred from ${normalizedChangedFiles.length} changed file(s); review manually.`;
  const overallConfidence =
    resolvedAffectedTests.length > 0
      ? confidenceLevelFromScore(resolvedAffectedTests[0].score)
      : suggestedPatches[0]?.confidenceLevel ?? 'low';

  return {
    repoPath: scan.repoPath,
    changedFiles: normalizedChangedFiles,
    diffSource: resolvedChanges.diffSource,
    riskySourceFiles,
    affectedTests: resolvedAffectedTests,
    suggestedRunTargets: resolvedAffectedTests.map((entry) => entry.file),
    suggestedPatches,
    confidenceLevel: overallConfidence,
    summary,
  };
}

async function buildPullRequestSummary(
  repoPath: string,
  changedFiles: string[] | undefined,
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean | undefined,
  staged: boolean | undefined,
  autoBase: boolean | undefined,
  sampleLimit: number
): Promise<PullRequestSummary> {
  const analysis = await analyzeImpact(
    repoPath,
    changedFiles,
    baseRef,
    headRef,
    workingTree,
    staged,
    autoBase,
    sampleLimit
  );
  const highestRisk = analysis.affectedTests[0];
  const title =
    analysis.affectedTests.length > 0
      ? `QA impact: ${analysis.affectedTests.length} likely affected test target(s)`
      : 'QA impact: manual review recommended';

  const bodyLines = [
    `Changed files: ${analysis.changedFiles.join(', ')}`,
    `Confidence: ${analysis.confidenceLevel}`,
    '',
    analysis.summary,
    '',
    'Affected tests:',
    ...(analysis.affectedTests.length > 0
      ? analysis.affectedTests.map(
          (entry) => `- ${entry.file} (score ${entry.score}): ${entry.reasons.join('; ')}`
        )
      : ['- No direct test mapping found.']),
    '',
    'Suggested run targets:',
    ...(analysis.suggestedRunTargets.length > 0
      ? analysis.suggestedRunTargets.map((target) => `- ${target}`)
      : ['- Manual selection required.']),
    '',
    'Suggested patch targets:',
    ...(analysis.suggestedPatches.length > 0
      ? analysis.suggestedPatches.map(
          (patch) =>
            `- ${patch.targetFile} (${Math.round(patch.confidence * 100)}%): ${patch.reason}`
        )
      : ['- No automatic patch suggestion.']),
  ];

  if (highestRisk) {
    bodyLines.unshift(`Highest-risk target: ${highestRisk.file}`);
    bodyLines.unshift('');
  }

  return {
    repoPath: analysis.repoPath,
    title,
    body: bodyLines.join('\n'),
    affectedTests: analysis.affectedTests.map((entry) => entry.file),
    suggestedRunTargets: analysis.suggestedRunTargets,
    changedFiles: analysis.changedFiles,
  };
}

async function buildTargetedRunPlan(
  repoPath: string,
  changedFiles: string[] | undefined,
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean | undefined,
  staged: boolean | undefined,
  autoBase: boolean | undefined,
  sampleLimit: number
): Promise<TargetedRunPlan> {
  const analysis = await analyzeImpact(
    repoPath,
    changedFiles,
    baseRef,
    headRef,
    workingTree,
    staged,
    autoBase,
    sampleLimit
  );
  const primary = analysis.affectedTests.filter((entry) => entry.score >= 5).map((entry) => entry.file);
  const secondary = analysis.affectedTests
    .filter((entry) => entry.score > 0 && entry.score < 5)
    .map((entry) => entry.file);

  const warnings: string[] = [];
  if (analysis.suggestedPatches.length === 0) {
    warnings.push('No automatic patch suggestion was derived from the current diff.');
  }
  if (analysis.affectedTests.length === 0) {
    warnings.push('No affected tests were inferred; manual QA review is recommended.');
  }

  return {
    repoPath: analysis.repoPath,
    changedFiles: analysis.changedFiles,
    diffSource: analysis.diffSource,
    runGroups: [
      {
        label: 'highest_priority',
        tests: primary,
        rationale: 'Run these tests first because they have the strongest path or semantic overlap with the diff.',
      },
      {
        label: 'secondary',
        tests: secondary,
        rationale: 'Run these next if the highest-priority group fails or if the change is broader than expected.',
      },
      {
        label: 'manual_review',
        tests: analysis.affectedTests.length === 0 ? analysis.changedFiles : [],
        rationale: 'No deterministic test mapping was found for these changes.',
      },
    ],
    confidenceLevel: analysis.confidenceLevel,
    warnings,
  };
}

function buildNoChangesDiffSource(
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean | undefined,
  staged: boolean | undefined,
  autoBase: boolean | undefined
): CiSummary['diffSource'] {
  if (workingTree) {
    return {
      mode: 'working_tree',
      staged: Boolean(staged),
    };
  }

  return {
    mode: 'git',
    ...(baseRef ? { baseRef } : {}),
    ...(headRef ? { headRef } : {}),
    ...(autoBase ? { autoBase: true } : {}),
  };
}

function buildNoChangesSummaryLines(
  format: 'markdown' | 'github' | 'plain',
  header: string,
  memorySummary: RepoMemorySummary
) {
  const memoryLines = memorySummary.topFailingTests.length
    ? memorySummary.topFailingTests.map((entry) => `- \`${entry.file}\` (${entry.count})`)
    : ['- none'];

  if (format === 'plain') {
    return [
      header,
      'No changes detected for the selected diff scope.',
      `Memory: ${memorySummary.failedRuns} failed run(s), ${memorySummary.acceptedPatches} accepted patch(es), ${memorySummary.rejectedPatches} rejected patch(es)`,
    ];
  }

  if (format === 'github') {
    return [
      AUTOQA_PR_COMMENT_MARKER,
      AUTOQA_PR_COMMENT_BLOCK_START,
      '',
      '## AutoQA PR QA Report',
      '',
      `**Mode:** ${header}`,
      '**Confidence:** low',
      '**Highest-risk test:** none',
      '**Run first:** none',
      '**Auto-fix:** none',
      '',
      '<details>',
      '<summary>No changes</summary>',
      '',
      '- No changes detected for the selected diff scope.',
      '',
      '</details>',
      '',
      '<details>',
      '<summary>Repo memory</summary>',
      '',
      `- Failed runs: ${memorySummary.failedRuns}`,
      `- Accepted patches: ${memorySummary.acceptedPatches}`,
      `- Rejected patches: ${memorySummary.rejectedPatches}`,
      `- Known flaky tests: ${memorySummary.knownFlakyTests}`,
      ...memoryLines,
      '',
      '</details>',
      '',
      AUTOQA_PR_COMMENT_BLOCK_END,
    ];
  }

  return [
    `## ${header}`,
    '',
    '- No changes detected for the selected diff scope.',
    '',
    '### Repo memory',
    `- Failed runs: ${memorySummary.failedRuns}`,
    `- Accepted patches: ${memorySummary.acceptedPatches}`,
    `- Rejected patches: ${memorySummary.rejectedPatches}`,
    `- Known flaky tests: ${memorySummary.knownFlakyTests}`,
    ...memoryLines,
  ];
}

async function buildCiSummary(
  repoPath: string,
  changedFiles: string[] | undefined,
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean | undefined,
  staged: boolean | undefined,
  autoBase: boolean | undefined,
  format: 'markdown' | 'github' | 'plain',
  sampleLimit: number
): Promise<CiSummary> {
  const resolvedRepoPath = resolve(repoPath);
  const memory = (await readRepoMemory(resolvedRepoPath)).memory;
  const memorySummary = buildRepoMemorySummary(memory);
  let analysis: ImpactAnalysisResult;
  let runPlan: TargetedRunPlan;

  try {
    analysis = await analyzeImpact(
      repoPath,
      changedFiles,
      baseRef,
      headRef,
      workingTree,
      staged,
      autoBase,
      sampleLimit
    );
    runPlan = await buildTargetedRunPlan(
      repoPath,
      changedFiles,
      baseRef,
      headRef,
      workingTree,
      staged,
      autoBase,
      sampleLimit
    );
  } catch (error) {
    if (!isNoDiffError(error)) {
      throw error;
    }

    const diffSource = buildNoChangesDiffSource(baseRef, headRef, workingTree, staged, autoBase);
    const header =
      diffSource.mode === 'working_tree'
        ? `Working tree QA summary (${diffSource.staged ? 'staged' : 'unstaged'})`
        : 'QA summary';
    return {
      repoPath: resolvedRepoPath,
      status: 'no_changes',
      format,
      diffSource,
      summary: buildNoChangesSummaryLines(format, header, memorySummary).join('\n'),
      affectedTests: [],
      suggestedRunTargets: [],
      changedFiles: [],
      memorySummary,
    };
  }

  const highestRisk = analysis.affectedTests[0]?.file ?? 'manual-review';
  const highestPriority =
    runPlan.runGroups.find((group) => group.label === 'highest_priority')?.tests ?? [];
  const autoFix = analysis.suggestedPatches[0];
  const header =
    analysis.diffSource.mode === 'working_tree'
      ? `Working tree QA summary (${analysis.diffSource.staged ? 'staged' : 'unstaged'})`
      : 'QA summary';

  let lines: string[];
  if (format === 'plain') {
    lines = [
      header,
      `Changed files: ${analysis.changedFiles.join(', ')}`,
      `Confidence: ${analysis.confidenceLevel}`,
      `Highest-risk test: ${highestRisk}`,
      `Run first: ${highestPriority.join(', ') || 'manual review'}`,
      `Auto-fix: ${autoFix ? `${autoFix.targetFile} - ${autoFix.reason}` : 'none'}`,
      `Memory: ${memorySummary.failedRuns} failed run(s), ${memorySummary.acceptedPatches} accepted patch(es)`,
    ];
  } else if (format === 'github') {
    lines = [
      AUTOQA_PR_COMMENT_MARKER,
      AUTOQA_PR_COMMENT_BLOCK_START,
      '',
      '## AutoQA PR QA Report',
      '',
      `**Mode:** ${header}`,
      `**Confidence:** ${analysis.confidenceLevel}`,
      `**Highest-risk test:** ${highestRisk}`,
      `**Run first:** ${highestPriority.join(', ') || 'manual review'}`,
      `**Auto-fix:** ${autoFix ? `${autoFix.targetFile} (${Math.round(autoFix.confidence * 100)}%)` : 'none'}`,
      '',
      '<details>',
      '<summary>Changed files</summary>',
      '',
      ...analysis.changedFiles.map((file) => `- \`${file}\``),
      '',
      '</details>',
      '',
      '<details>',
      '<summary>Suggested run targets</summary>',
      '',
      ...(analysis.suggestedRunTargets.length
        ? analysis.suggestedRunTargets.map((target) => `- \`${target}\``)
        : ['- manual review']),
      '',
      '</details>',
      '',
      '<details>',
      '<summary>Repo memory</summary>',
      '',
      `- Failed runs: ${memorySummary.failedRuns}`,
      `- Accepted patches: ${memorySummary.acceptedPatches}`,
      `- Rejected patches: ${memorySummary.rejectedPatches}`,
      `- Known flaky tests: ${memorySummary.knownFlakyTests}`,
      ...(memorySummary.topFailingTests.length
        ? memorySummary.topFailingTests.map((entry) => `- \`${entry.file}\` (${entry.count})`)
        : ['- none']),
      '',
      '</details>',
      '',
      '<details>',
      '<summary>Notes</summary>',
      '',
      ...(runPlan.warnings.length
        ? runPlan.warnings.map((warning) => `- ${warning}`)
        : ['- No blocking warnings.']),
      '',
      '</details>',
      '',
      AUTOQA_PR_COMMENT_BLOCK_END,
    ];
  } else {
    lines = [
      `## ${header}`,
      '',
      `- Changed files: ${analysis.changedFiles.join(', ')}`,
      `- Confidence: ${analysis.confidenceLevel}`,
      `- Highest-risk test: ${highestRisk}`,
      `- Run first: ${highestPriority.join(', ') || 'manual review'}`,
      `- Auto-fix: ${autoFix ? `${autoFix.targetFile} (${Math.round(autoFix.confidence * 100)}%)` : 'none'}`,
      `- Memory: ${memorySummary.failedRuns} failed run(s), ${memorySummary.acceptedPatches} accepted patch(es)`,
      '',
      '### Suggested run targets',
      ...(analysis.suggestedRunTargets.length
        ? analysis.suggestedRunTargets.map((target) => `- ${target}`)
        : ['- manual review']),
      '',
      '### Notes',
      ...(runPlan.warnings.length
        ? runPlan.warnings.map((warning) => `- ${warning}`)
        : ['- No blocking warnings.']),
    ];
  }

  return {
    repoPath: analysis.repoPath,
    status: 'completed',
    format,
    diffSource: analysis.diffSource,
    summary: lines.join('\n'),
    affectedTests: analysis.affectedTests.map((entry) => entry.file),
    suggestedRunTargets: analysis.suggestedRunTargets,
    changedFiles: analysis.changedFiles,
    memorySummary,
  };
}

async function executeRunPlan(
  repoPath: string,
  changedFiles: string[] | undefined,
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean | undefined,
  staged: boolean | undefined,
  autoBase: boolean | undefined,
  policyMode: PolicyMode,
  maxTests: number,
  sampleLimit: number
): Promise<RunPlanExecution> {
  const settings = await loadRepoSettings(repoPath);
  const policySource = resolvePolicySource(settings, policyMode);
  const runPlan = await buildTargetedRunPlan(
    repoPath,
    changedFiles,
    baseRef,
    headRef,
    workingTree,
    staged,
    autoBase,
    sampleLimit
  );
  const highestPriority =
    runPlan.runGroups.find((group) => group.label === 'highest_priority')?.tests ?? [];
  const secondary = runPlan.runGroups.find((group) => group.label === 'secondary')?.tests ?? [];
  const policyCap = policyMode === 'enforce' || policyMode === 'auto'
    ? settings.policy.testBudget.maxTests
    : maxTests;
  const selectedTests = (highestPriority.length ? highestPriority : secondary).slice(
    0,
    Math.min(maxTests, policyCap)
  );
  const policyTrace: PolicyTrace = {
    mode: policyMode,
    source: policySource,
    applyThreshold: settings.policy.confidenceThresholds.apply,
    verifyThreshold: settings.policy.confidenceThresholds.verify,
    maxTestsRequested: maxTests,
    maxTestsApplied: Math.min(maxTests, policyCap),
    blockedReasons:
      maxTests > policyCap ? [`test budget capped requested ${maxTests} -> ${policyCap}`] : [],
    blockedReasonCodes: maxTests > policyCap ? ['test_budget_capped'] : [],
  };

  return executePlaywrightTests(repoPath, selectedTests, policyTrace);
}

async function executePlaywrightTests(
  repoPath: string,
  selectedTests: string[],
  policy: PolicyTrace
): Promise<RunPlanExecution> {
  if (!selectedTests.length) {
    return {
      repoPath: resolve(repoPath),
      command: [],
      tests: [],
      executed: false,
      exitCode: 0,
      status: 'skipped',
      stdout: '',
      stderr: 'No tests selected by targeted run plan.',
      blockedReasons: policy.blockedReasons,
      blockedReasonCodes: policy.blockedReasonCodes,
      policy,
    };
  }

  const cliPath = resolvePlaywrightCliPath(repoPath);
  const command = [
    process.execPath,
    cliPath,
    'test',
    '--workers=1',
    '--reporter=line',
    ...selectedTests,
  ];

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, command.slice(1), {
      cwd: resolve(repoPath),
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
      },
    });

    return {
      repoPath: resolve(repoPath),
      command,
      tests: selectedTests,
      executed: true,
      exitCode: 0,
      status: 'passed',
      stdout,
      stderr,
      blockedReasons: policy.blockedReasons,
      blockedReasonCodes: policy.blockedReasonCodes,
      policy,
    };
  } catch (error) {
    const executionError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };

    return {
      repoPath: resolve(repoPath),
      command,
      tests: selectedTests,
      executed: true,
      exitCode: typeof executionError.code === 'number' ? executionError.code : 1,
      status: 'failed',
      stdout: executionError.stdout ?? '',
      stderr: executionError.stderr ?? executionError.message,
      blockedReasons: policy.blockedReasons,
      blockedReasonCodes: policy.blockedReasonCodes,
      policy,
    };
  }
}

async function verifyPatch(
  repoPath: string,
  issue: string,
  changedFiles: string[] | undefined,
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean | undefined,
  staged: boolean | undefined,
  autoBase: boolean | undefined,
  maxTests: number,
  sampleLimit: number,
  reportDir?: string,
  artifactPaths?: string[],
  policyMode: PolicyMode = 'auto',
  applyThresholdOverride?: number,
  verifyThresholdOverride?: number
): Promise<PatchVerification> {
  const settings = await loadRepoSettings(repoPath);
  const policySource = resolvePolicySource(settings, policyMode, {
    applyThresholdOverride,
    verifyThresholdOverride,
  });
  const patch = await suggestPatch(
    repoPath,
    issue,
    sampleLimit,
    changedFiles,
    baseRef,
    headRef,
    workingTree,
    staged,
    autoBase,
    true,
    reportDir,
    artifactPaths,
    policyMode,
    applyThresholdOverride
  );

  const runPlan = await buildTargetedRunPlan(
    repoPath,
    changedFiles,
    baseRef,
    headRef,
    workingTree,
    staged,
    autoBase,
    sampleLimit
  );

  const policyCappedMaxTests =
    policyMode === 'enforce' || policyMode === 'auto'
      ? settings.policy.testBudget.maxTests
      : maxTests;
  const effectiveMaxTests = Math.max(1, Math.min(maxTests, policyCappedMaxTests));
  const patchConfidence = patch.confidence;
  const verifyThreshold =
    policyMode === 'enforce' || policyMode === 'auto'
      ? clamp01(
          verifyThresholdOverride ?? settings.policy.confidenceThresholds.verify,
          settings.policy.confidenceThresholds.verify
        )
      : 0;
  const verifyAllowed = patchConfidence >= verifyThreshold;
  const verifyBlockedReasons = [...patch.blockedReasons];
  const verifyBlockedReasonCodes = [...patch.blockedReasonCodes];
  if (maxTests > policyCappedMaxTests) {
    verifyBlockedReasons.push(`test budget capped requested ${maxTests} -> ${policyCappedMaxTests}`);
    verifyBlockedReasonCodes.push('test_budget_capped');
  }
  if (patch.applied && !verifyAllowed) {
    verifyBlockedReasons.push(
      `confidence ${patchConfidence.toFixed(2)} below verify threshold ${verifyThreshold.toFixed(2)}`
    );
    verifyBlockedReasonCodes.push('below_verify_threshold');
  }
  const verifyPolicyTrace: PolicyTrace = {
    mode: policyMode,
    source: policySource,
    applyThreshold: patch.policy.applyThreshold,
    verifyThreshold,
    shouldApply: patch.applied,
    shouldVerify: patch.applied && verifyAllowed,
    maxTestsRequested: maxTests,
    maxTestsApplied: effectiveMaxTests,
    blockedReasons: dedupeStrings(verifyBlockedReasons),
    blockedReasonCodes: dedupeStrings(verifyBlockedReasonCodes) as PolicyReasonCode[],
  };
  const execution = patch.applied
    ? verifyAllowed
      ? await executePlaywrightTests(
          repoPath,
          [patch.targetFile].slice(0, effectiveMaxTests),
          verifyPolicyTrace
        )
      : {
          repoPath: resolve(repoPath),
          command: [],
          tests: [],
          executed: false,
          exitCode: 0,
          status: 'skipped' as const,
          stdout: '',
          stderr: `Verify execution skipped by policy: confidence ${patchConfidence.toFixed(2)} below verify threshold ${verifyThreshold.toFixed(2)}.`,
          blockedReasons: verifyPolicyTrace.blockedReasons,
          blockedReasonCodes: verifyPolicyTrace.blockedReasonCodes,
          policy: verifyPolicyTrace,
        }
    : {
        repoPath: resolve(repoPath),
        command: [],
        tests: [],
        executed: false,
        exitCode: 0,
        status: 'skipped' as const,
        stdout: '',
        stderr: 'Patch was not applied (confidence threshold or policy block).',
        blockedReasons: verifyPolicyTrace.blockedReasons,
        blockedReasonCodes: verifyPolicyTrace.blockedReasonCodes,
        policy: verifyPolicyTrace,
      };

  const verificationStatus =
    patch.applied && execution.status === 'passed'
      ? 'passed'
      : patch.applied && execution.status === 'failed'
        ? 'failed'
        : 'skipped';

  const report = await writeVerificationReport({
    repoPath: resolve(repoPath),
    patch,
    runPlan,
    execution,
    status: verificationStatus,
    evidenceUsed: patch.evidenceUsed,
    blockedReasons: verifyPolicyTrace.blockedReasons,
    blockedReasonCodes: verifyPolicyTrace.blockedReasonCodes,
    policy: verifyPolicyTrace,
  });

  await writeRepoMemoryAfterVerification(repoPath, issue, {
    patch,
    runPlan,
    execution,
    reportPath: report.path,
    status: verificationStatus,
    evidenceUsed: patch.evidenceUsed,
    blockedReasons: verifyPolicyTrace.blockedReasons,
    blockedReasonCodes: verifyPolicyTrace.blockedReasonCodes,
    policy: verifyPolicyTrace,
  }).catch((error) => {
    console.error(
      `[autoqa][memory] failed to persist verification memory: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  });

  return {
    repoPath: resolve(repoPath),
    patch,
    runPlan,
    execution,
    reportPath: report.path,
    status: verificationStatus,
    evidenceUsed: patch.evidenceUsed,
    blockedReasons: verifyPolicyTrace.blockedReasons,
    blockedReasonCodes: verifyPolicyTrace.blockedReasonCodes,
    policy: verifyPolicyTrace,
  };
}

async function writeVerificationReport(
  payload: Omit<PatchVerification, 'reportPath'>
) {
  const reportsDir = join(process.cwd(), 'reports');
  await mkdir(reportsDir, { recursive: true });

  const path = join(reportsDir, `autoqa-verify-${Date.now()}.md`);
  const body = [
    '# AutoQA Patch Verification',
    '',
    `Repo: ${payload.repoPath}`,
    `Status: ${payload.status}`,
    `Patch target: ${payload.patch.targetFile}`,
    `Patch confidence: ${payload.patch.confidenceLevel}`,
    `Patch applied: ${payload.patch.applied}`,
    `Executed tests: ${payload.execution.tests.join(', ') || 'none'}`,
    `Execution status: ${payload.execution.status}`,
    '',
    '## Patch reason',
    '',
    payload.patch.reason,
    '',
    '## Evidence used',
    '',
    ...(payload.evidenceUsed.length
      ? payload.evidenceUsed.map(
          (item) => `- ${item.kind} (${item.source}) [${item.path}]: ${item.snippet}`
        )
      : ['- none']),
    '',
    '## Policy',
    '',
    `- mode: ${payload.policy.mode}`,
    `- source: ${payload.policy.source}`,
    `- apply threshold: ${payload.policy.applyThreshold.toFixed(2)}`,
    `- verify threshold: ${payload.policy.verifyThreshold?.toFixed(2) ?? 'n/a'}`,
    `- should apply: ${payload.policy.shouldApply ? 'yes' : 'no'}`,
    `- should verify: ${payload.policy.shouldVerify ? 'yes' : 'no'}`,
    `- max tests: ${payload.policy.maxTestsApplied ?? 0}/${payload.policy.maxTestsRequested ?? 0}`,
    ...(payload.policy.blockedReasons.length
      ? payload.policy.blockedReasons.map((reason) => `- blocked: ${reason}`)
      : ['- blocked: none']),
    '',
    '## Run plan',
    '',
    ...payload.runPlan.runGroups.map(
      (group) => `- ${group.label}: ${group.tests.join(', ') || 'none'}`
    ),
    '',
    '## Command',
    '',
    payload.execution.command.length ? `\`${payload.execution.command.join(' ')}\`` : 'Not executed',
    '',
    '## stderr',
    '',
    '```text',
    payload.execution.stderr || '(empty)',
    '```',
    '',
    '## stdout',
    '',
    '```text',
    payload.execution.stdout || '(empty)',
    '```',
    '',
  ].join('\n');

  await writeFile(path, body, 'utf8');
  return { path };
}

function createRepoFingerprint(repoPath: string) {
  return createHash('sha256').update(normalizePath(resolve(repoPath))).digest('hex').slice(0, 16);
}

function createEmptyRepoMemory(repoPath: string): AutoQaRepoMemory {
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    repoFingerprint: createRepoFingerprint(repoPath),
    knownFlakyTests: [],
    recentFailures: [],
    acceptedPatches: [],
    rejectedPatches: [],
    selectorHistory: [],
    routeHistory: [],
  };
}

function sanitizeMemoryRecord(input: unknown, repoPath: string): AutoQaRepoMemory {
  const fallback = createEmptyRepoMemory(repoPath);

  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const value = input as Partial<AutoQaRepoMemory>;
  const repoFingerprint =
    typeof value.repoFingerprint === 'string' && value.repoFingerprint.length > 0
      ? value.repoFingerprint
      : fallback.repoFingerprint;

  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt,
    repoFingerprint,
    knownFlakyTests: Array.isArray(value.knownFlakyTests)
      ? value.knownFlakyTests.filter((entry): entry is string => typeof entry === 'string')
      : [],
    recentFailures: Array.isArray(value.recentFailures)
      ? value.recentFailures.filter((entry): entry is MemoryFailureRecord => Boolean(entry && typeof entry === 'object'))
      : [],
    acceptedPatches: Array.isArray(value.acceptedPatches)
      ? value.acceptedPatches.filter((entry): entry is MemoryPatchRecord => Boolean(entry && typeof entry === 'object'))
      : [],
    rejectedPatches: Array.isArray(value.rejectedPatches)
      ? value.rejectedPatches.filter((entry): entry is MemoryPatchRecord => Boolean(entry && typeof entry === 'object'))
      : [],
    selectorHistory: Array.isArray(value.selectorHistory)
      ? value.selectorHistory.filter((entry): entry is MemorySelectorHistoryEntry => Boolean(entry && typeof entry === 'object'))
      : [],
    routeHistory: Array.isArray(value.routeHistory)
      ? value.routeHistory.filter((entry): entry is MemorySelectorHistoryEntry => Boolean(entry && typeof entry === 'object'))
      : [],
  };
}

async function readRepoMemory(repoPath: string) {
  const stateDir = join(resolve(repoPath), '.autoqa', 'state');
  const memoryPath = join(stateDir, 'memory.json');
  const raw = await readFile(memoryPath, 'utf8').catch(() => null);

  if (!raw) {
    return {
      memoryPath,
      memory: createEmptyRepoMemory(repoPath),
      existed: false,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      memoryPath,
      memory: sanitizeMemoryRecord(parsed, repoPath),
      existed: true,
    };
  } catch {
    return {
      memoryPath,
      memory: createEmptyRepoMemory(repoPath),
      existed: false,
    };
  }
}

const localRepoMemoryAdapter: RepoMemoryAdapter = {
  read: readRepoMemory,
  async write(_repoPath: string, memoryPath: string, memory: AutoQaRepoMemory) {
    await mkdir(dirname(memoryPath), { recursive: true });
    await writeFile(memoryPath, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
  },
};

function trimToSize<T>(items: T[], max: number) {
  if (items.length <= max) {
    return items;
  }

  return items.slice(items.length - max);
}

function extractReplacementHistory(
  patch: SuggestedPatch,
  sourceFile: string,
  kind: 'selector' | 'route'
): MemorySelectorHistoryEntry[] {
  const replacements = extractSemanticReplacements(
    patch.patch.content.split(/\r?\n/),
    patch.patch.findText.split(/\r?\n/)
  ).filter((entry) =>
    kind === 'selector'
      ? ['class', 'testid', 'aria-label', 'role', 'text'].includes(entry.kind)
      : ['route', 'href'].includes(entry.kind)
  );

  const now = new Date().toISOString();
  return replacements.map((entry) => ({
    timestamp: now,
    from: entry.before,
    to: entry.after,
    sourceFile,
  }));
}

async function writeRepoMemoryAfterVerification(
  repoPath: string,
  issue: string,
  verification: Omit<PatchVerification, 'repoPath'>
) {
  const { memoryPath, memory } = await localRepoMemoryAdapter.read(repoPath);
  const now = new Date().toISOString();
  const evidenceKinds = Array.from(new Set(verification.evidenceUsed.map((item) => item.kind)));
  const tests = verification.execution.tests;
  const failureRecord: MemoryFailureRecord = {
    timestamp: now,
    status: verification.status,
    tests,
    evidenceKinds,
  };
  const patchRecord: MemoryPatchRecord = {
    timestamp: now,
    issue,
    targetFile: verification.patch.targetFile,
    confidenceLevel: verification.patch.confidenceLevel,
    applied: verification.patch.applied,
    status: verification.status,
    reason: verification.patch.reason,
  };

  const nextMemory: AutoQaRepoMemory = {
    ...memory,
    schemaVersion: MEMORY_SCHEMA_VERSION,
    updatedAt: now,
    repoFingerprint: createRepoFingerprint(repoPath),
    knownFlakyTests: memory.knownFlakyTests,
    recentFailures: trimToSize([...memory.recentFailures, failureRecord], MEMORY_MAX_RECENT_FAILURES),
    acceptedPatches:
      verification.status === 'passed'
        ? trimToSize([...memory.acceptedPatches, patchRecord], MEMORY_MAX_ACCEPTED_PATCHES)
        : memory.acceptedPatches,
    rejectedPatches:
      verification.status !== 'passed'
        ? trimToSize([...memory.rejectedPatches, patchRecord], MEMORY_MAX_REJECTED_PATCHES)
        : memory.rejectedPatches,
    selectorHistory: trimToSize(
      [...memory.selectorHistory, ...extractReplacementHistory(verification.patch, verification.patch.targetFile, 'selector')],
      MEMORY_MAX_SELECTOR_HISTORY
    ),
    routeHistory: trimToSize(
      [...memory.routeHistory, ...extractReplacementHistory(verification.patch, verification.patch.targetFile, 'route')],
      MEMORY_MAX_ROUTE_HISTORY
    ),
  };

  await localRepoMemoryAdapter.write(repoPath, memoryPath, nextMemory);
}

async function resolveDirectoryPath(inputPath: string) {
  const absolutePath = resolve(inputPath);
  const metadata = await stat(absolutePath).catch(() => null);

  if (!metadata?.isDirectory()) {
    throw new Error(`Directory not found: ${absolutePath}`);
  }

  return absolutePath;
}

function resolveRepoRelativePath(repoPath: string, filePath: string) {
  const absolutePath = resolve(repoPath, filePath);
  const normalizedRepo = normalizePath(repoPath);
  const normalizedAbsolutePath = normalizePath(absolutePath);
  const repoPrefix = normalizedRepo.endsWith('/') ? normalizedRepo : `${normalizedRepo}/`;

  if (normalizedAbsolutePath !== normalizedRepo && !normalizedAbsolutePath.startsWith(repoPrefix)) {
    throw new Error(`Refusing to access file outside repository: ${filePath}`);
  }

  return absolutePath;
}

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').toLowerCase();
}

async function listRepositoryFiles(repoPath: string, settings: RepoSettings) {
  const cacheKey = `${repoPath}:${settings.ignorePatterns.join('|')}`;
  const cached = getCachedValue(repoFileCache, cacheKey);
  if (cached) {
    return cached;
  }

  const stack = [repoPath];
  const files: string[] = [];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath) {
      continue;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          stack.push(join(currentPath, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const absoluteEntryPath = join(currentPath, entry.name);
      const relativePath = absoluteEntryPath.slice(repoPath.length + 1).split(sep).join('/');
      if (!shouldIgnorePath(relativePath, settings)) {
        files.push(relativePath);
      }
    }
  }

  const sortedFiles = files.sort((left, right) => left.localeCompare(right));
  setCachedValue(repoFileCache, cacheKey, sortedFiles);
  return sortedFiles;
}

async function readPackageJsonIfPresent(repoPath: string, files: string[]) {
  if (!files.includes('package.json')) {
    return null;
  }

  try {
    const packageJson = await readFile(join(repoPath, 'package.json'), 'utf8');
    return JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

function detectPackageManager(files: string[]): RepoScanResult['packageManager'] {
  if (files.includes('pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (files.includes('package-lock.json')) {
    return 'npm';
  }
  if (files.includes('yarn.lock')) {
    return 'yarn';
  }
  return 'unknown';
}

function detectFrameworks(
  files: string[],
  packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null
) {
  const frameworks = new Set<string>();
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };

  if (dependencies.playwright || dependencies['@playwright/test']) {
    frameworks.add('playwright');
  }
  if (dependencies.cypress) {
    frameworks.add('cypress');
  }
  if (dependencies.vitest) {
    frameworks.add('vitest');
  }
  if (dependencies.jest) {
    frameworks.add('jest');
  }

  if (files.some((file) => /(^|[/\\])playwright\.config\.(ts|js|mjs|cjs)$/i.test(file))) {
    frameworks.add('playwright');
  }
  if (files.some((file) => /cypress/i.test(file))) {
    frameworks.add('cypress');
  }

  return Array.from(frameworks).sort((left, right) => left.localeCompare(right));
}

function buildPatchProposal(content: string, issueLower: string, issue: string) {
  const rename = extractRenameFromIssue(issue);

  if (rename) {
    const renameBasedProposal = buildRenamePatchProposal(content, rename.before, rename.after);
    if (renameBasedProposal) {
      return renameBasedProposal;
    }
  }

  if (
    (issueLower.includes('locator') ||
      issueLower.includes('selector') ||
      issueLower.includes('role') ||
      issueLower.includes('button')) &&
    content.includes("page.locator('.login-button')")
  ) {
    return {
      reason: 'Found a brittle CSS locator and proposed a role-based Playwright locator.',
      confidence: 0.8,
      findText: "page.locator('.login-button')",
      content: "page.getByRole('button', { name: 'Login' })",
    };
  }

  if (
    issueLower.includes('testid') &&
    content.includes("page.locator('.login-button')")
  ) {
    return {
      reason: 'Translated a brittle CSS locator into a data-testid selector based on the issue text.',
      confidence: 0.72,
      findText: "page.locator('.login-button')",
      content: "page.getByTestId('login-button')",
    };
  }

  if (
    (issueLower.includes('networkidle') ||
      issueLower.includes('timing') ||
      issueLower.includes('navigation') ||
      issueLower.includes('flaky')) &&
    content.includes('await page.goto(') &&
    !content.includes("waitForLoadState('networkidle')") &&
    !content.includes('waitForLoadState("networkidle")')
  ) {
    const gotoLineMatch = content.match(/^\s*await page\.goto\([^)]*\);\s*$/m);
    const gotoLine = gotoLineMatch?.[0];
    if (!gotoLine) {
      return null;
    }

    const indentation = gotoLine.match(/^\s*/)?.[0] ?? '';
    return {
      reason: 'Added an explicit load-state wait after navigation for a timing-related issue.',
      confidence: 0.68,
      findText: gotoLine,
      content: `${gotoLine}\n${indentation}await page.waitForLoadState('networkidle');`,
    };
  }

  return null;
}

async function collectArtifactEvidence(
  repoPath: string,
  reportDir?: string,
  artifactPaths?: string[]
): Promise<ArtifactEvidence[]> {
  const candidates = new Set<string>();

  if (reportDir) {
    const reportAbsolute = resolveRepoRelativePath(repoPath, reportDir);
    const reportFiles = await listTextFilesRecursively(reportAbsolute).catch(() => []);
    for (const file of reportFiles) {
      const normalized = normalizePath(file);
      if (
        normalized.endsWith('error-context.md') ||
        normalized.endsWith('.stderr.txt') ||
        normalized.endsWith('.stdout.txt') ||
        normalized.endsWith('.log')
      ) {
        candidates.add(file);
      }
    }
  }

  if (artifactPaths?.length) {
    for (const relativePath of artifactPaths) {
      candidates.add(resolveRepoRelativePath(repoPath, relativePath));
    }
  }

  const evidence: ArtifactEvidence[] = [];
  for (const candidate of candidates) {
    const text = await readFile(candidate, 'utf8').catch(() => '');
    if (!text.trim()) {
      continue;
    }
    evidence.push({
      source: candidate.toLowerCase().includes('error-context')
        ? 'error_context'
        : candidate.toLowerCase().includes('stderr')
          ? 'stderr'
          : candidate.toLowerCase().includes('stdout')
            ? 'stdout'
            : 'text',
      path: candidate,
      kind: detectArtifactKind(text),
      snippet: buildSnippet(text),
    });
  }

  return evidence.slice(0, 10);
}

async function listTextFilesRecursively(rootPath: string): Promise<string[]> {
  const stack = [rootPath];
  const files: string[] = [];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath) {
      continue;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }

  return files;
}

function detectArtifactKind(text: string): ArtifactEvidenceKind {
  const normalized = text.toLowerCase();

  if (normalized.includes('locator') || normalized.includes('element') || normalized.includes('not found')) {
    return 'selector_drift';
  }
  if (normalized.includes('tohavetext') || normalized.includes('text') || normalized.includes('expected')) {
    return 'text_drift';
  }
  if (normalized.includes('tohaveurl') || normalized.includes('navigation') || normalized.includes('page.goto')) {
    return 'navigation_drift';
  }
  if (normalized.includes('timeout') || normalized.includes('networkidle')) {
    return 'timing_issue';
  }
  if (normalized.includes('401') || normalized.includes('403') || normalized.includes('unauthorized')) {
    return 'auth_issue';
  }
  if (normalized.includes('fixture') || normalized.includes('beforeeach')) {
    return 'fixture_issue';
  }

  return 'unknown';
}

function buildSnippet(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function adjustConfidenceWithEvidence(baseConfidence: number, evidence: ArtifactEvidence[]) {
  if (!evidence.length) {
    return baseConfidence;
  }

  const hasUsefulEvidence = evidence.some((item) => item.kind !== 'unknown');
  if (!hasUsefulEvidence) {
    return baseConfidence;
  }

  return Math.min(baseConfidence + 0.08, 0.95);
}

function extractRenameFromIssue(issue: string) {
  const quotedFromTo = issue.match(/from\s+["'`]([^"'`]+)["'`]\s+to\s+["'`]([^"'`]+)["'`]/i);
  if (quotedFromTo) {
    return {
      before: quotedFromTo[1],
      after: quotedFromTo[2],
    };
  }

  const arrowRename = issue.match(/["'`]([^"'`]+)["'`]\s*->\s*["'`]([^"'`]+)["'`]/);
  if (arrowRename) {
    return {
      before: arrowRename[1],
      after: arrowRename[2],
    };
  }

  return null;
}

function buildRenamePatchProposal(content: string, before: string, after: string) {
  const pairs = [
    {
      findText: `hasText: "${before}"`,
      content: `hasText: "${after}"`,
      reason: 'Updated hasText matcher based on issue-provided text rename.',
      confidence: 0.76,
    },
    {
      findText: `hasText: '${before}'`,
      content: `hasText: '${escapeSingleQuotes(after)}'`,
      reason: 'Updated hasText matcher based on issue-provided text rename.',
      confidence: 0.76,
    },
    {
      findText: `name: "${before}"`,
      content: `name: "${after}"`,
      reason: 'Updated role locator label based on issue-provided text rename.',
      confidence: 0.78,
    },
    {
      findText: `name: '${before}'`,
      content: `name: '${escapeSingleQuotes(after)}'`,
      reason: 'Updated role locator label based on issue-provided text rename.',
      confidence: 0.78,
    },
    {
      findText: `getByText("${before}")`,
      content: `getByText("${after}")`,
      reason: 'Updated getByText locator based on issue-provided text rename.',
      confidence: 0.75,
    },
    {
      findText: `getByText('${before}')`,
      content: `getByText('${escapeSingleQuotes(after)}')`,
      reason: 'Updated getByText locator based on issue-provided text rename.',
      confidence: 0.75,
    },
    {
      findText: `toHaveText("${before}")`,
      content: `toHaveText("${after}")`,
      reason: 'Updated text assertion based on issue-provided text rename.',
      confidence: 0.73,
    },
    {
      findText: `toHaveText('${before}')`,
      content: `toHaveText('${escapeSingleQuotes(after)}')`,
      reason: 'Updated text assertion based on issue-provided text rename.',
      confidence: 0.73,
    },
  ];

  for (const candidate of pairs) {
    if (content.includes(candidate.findText)) {
      return candidate;
    }
  }

  return null;
}

function scoreTestAgainstChanges(
  testFile: string,
  changedFiles: string[],
  diffSignals: DiffSignal[],
  testContent: string
) {
  const reasons: string[] = [];
  let score = 0;
  const testTokens = tokenizePath(testFile);

  for (const changedFile of changedFiles) {
    const changedTokens = tokenizePath(changedFile);
    const sharedTokens = intersectTokens(testTokens, changedTokens);

    if (sharedTokens.length > 0) {
      score += Math.min(sharedTokens.length * 2, 6);
      reasons.push(`Shared path tokens with ${changedFile}: ${sharedTokens.join(', ')}`);
    }

    if (sameBasenameFamily(testFile, changedFile)) {
      score += 4;
      reasons.push(`Filename family matches changed file ${changedFile}`);
    }

    if (changedFile.startsWith('src/') && testFile.startsWith('tests/')) {
      score += 1;
      reasons.push(`Source change ${changedFile} may require test maintenance`);
    }
  }

  const testSignalBoost = scoreTestAgainstDiffSignals(testFile, diffSignals, testContent);
  score += testSignalBoost.score;
  reasons.push(...testSignalBoost.reasons);

  return {
    score,
    reasons: dedupeStrings(reasons),
  };
}

function scoreTestAgainstDiffSignals(testFile: string, diffSignals: DiffSignal[], testContent: string) {
  const reasons: string[] = [];
  let score = 0;
  const fileTokens = tokenizePath(testFile);
  const normalizedContent = normalizeCodeForMatching(testContent);

  for (const signal of diffSignals) {
    const signalTokens = [
      ...tokenizeLines(signal.addedLines),
      ...tokenizeLines(signal.removedLines),
      ...tokenizePath(signal.file),
    ];
    const sharedTokens = intersectTokens(fileTokens, signalTokens);

    if (sharedTokens.length > 0) {
      score += Math.min(sharedTokens.length * 2, 5);
      reasons.push(`Shared semantic tokens with diff in ${signal.file}: ${sharedTokens.join(', ')}`);
    }

    if (signal.changeTypes.includes('selector') || signal.changeTypes.includes('text')) {
      score += 1;
      reasons.push(`UI-facing change detected in ${signal.file}`);
    }

    if (signal.changeTypes.includes('navigation')) {
      score += 1;
      reasons.push(`Navigation-related diff detected in ${signal.file}`);
    }

    for (const replacement of signal.semanticReplacements) {
      const testContentHints = `${fileTokens.join(' ')} ${normalizedContent}`;
      if (
        replacement.kind === 'class' &&
        testContentHints.includes(stripSemanticToken(replacement.before))
      ) {
        score += 2;
        reasons.push(`Semantic selector rename in ${signal.file}: .${replacement.before} -> .${replacement.after}`);
      }

      if (replacement.kind === 'text' && testContentHints.includes(stripSemanticToken(replacement.before))) {
        score += 2;
        reasons.push(`Semantic text rename in ${signal.file}: "${replacement.before}" -> "${replacement.after}"`);
      }

      if (
        (replacement.kind === 'testid' ||
          replacement.kind === 'route' ||
          replacement.kind === 'href' ||
          replacement.kind === 'aria-label' ||
          replacement.kind === 'role') &&
        testContentHints.includes(stripSemanticToken(replacement.before))
      ) {
        score += 2;
        reasons.push(`Semantic ${replacement.kind} rename in ${signal.file}: ${replacement.before} -> ${replacement.after}`);
      }
    }
  }

  return {
    score,
    reasons,
  };
}

function derivePatchIssuesFromChanges(changedFiles: string[], diffSignals: DiffSignal[] = []) {
  const issues: string[] = [];

  for (const signal of diffSignals) {
    for (const replacement of signal.semanticReplacements) {
      if (replacement.kind === 'class') {
        issues.push(
          `Selector rename from .${replacement.before} to .${replacement.after}. Prefer a role-based locator or update the selector.`
        );
      }

      if (replacement.kind === 'testid') {
        issues.push(
          `data-testid changed from ${replacement.before} to ${replacement.after}. Update test ids in affected specs.`
        );
      }

      if (replacement.kind === 'text') {
        issues.push(
          `Button text changed from "${replacement.before}" to "${replacement.after}". Update role locators or text assertions.`
        );
      }

      if (replacement.kind === 'route') {
        issues.push(
          `Navigation route changed from ${replacement.before} to ${replacement.after}. Re-check page.goto targets and waits.`
        );
      }

      if (replacement.kind === 'href') {
        issues.push(
          `Link href changed from ${replacement.before} to ${replacement.after}. Update route assertions or link locators.`
        );
      }

      if (replacement.kind === 'aria-label') {
        issues.push(
          `aria-label changed from "${replacement.before}" to "${replacement.after}". Update accessible locators.`
        );
      }

      if (replacement.kind === 'role') {
        issues.push(
          `Role changed from ${replacement.before} to ${replacement.after}. Update getByRole or role selectors in affected tests.`
        );
      }
    }
  }

  for (const changedFile of changedFiles) {
    const lower = changedFile.toLowerCase();

    if (lower.includes('button') || lower.includes('login')) {
      issues.push('Login button selector drift. Prefer a role-based locator.');
    }

    if (lower.includes('component') || lower.includes('ui') || lower.includes('page')) {
      issues.push('Potential locator drift after UI refactor. Prefer stable role or test id selectors.');
    }

    if (lower.includes('route') || lower.includes('navigation')) {
      issues.push('Navigation timing issue after route changes. Add networkidle wait after page.goto.');
    }
  }

  return dedupeStrings(issues);
}

function buildSemanticPatchProposal(
  content: string,
  diffSignals: DiffSignal[],
  issueLower: string
) {
  const semanticReplacements = diffSignals.flatMap((signal) => signal.semanticReplacements);
  const textReplacement = semanticReplacements.find((item) => item.kind === 'text');
  const classReplacement = semanticReplacements.find((item) => item.kind === 'class');
  const testIdReplacement = semanticReplacements.find((item) => item.kind === 'testid');
  const routeReplacement = semanticReplacements.find((item) => item.kind === 'route');
  const hrefReplacement = semanticReplacements.find((item) => item.kind === 'href');
  const ariaReplacement = semanticReplacements.find((item) => item.kind === 'aria-label');
  const roleReplacement = semanticReplacements.find((item) => item.kind === 'role');

  if (
    classReplacement &&
    textReplacement &&
    content.includes(`page.locator('.${classReplacement.before}')`)
  ) {
    return {
      reason: `Detected selector rename .${classReplacement.before} -> .${classReplacement.after} and text rename "${textReplacement.before}" -> "${textReplacement.after}" in the diff; proposed a role-based locator anchored to the new label.`,
      confidence: 0.93,
      findText: `page.locator('.${classReplacement.before}')`,
      content: `page.getByRole('button', { name: '${escapeSingleQuotes(textReplacement.after)}' })`,
    };
  }

  if (
    testIdReplacement &&
    (content.includes(`getByTestId('${testIdReplacement.before}')`) ||
      content.includes(`getByTestId("${testIdReplacement.before}")`))
  ) {
    return {
      reason: `Detected data-testid rename ${testIdReplacement.before} -> ${testIdReplacement.after} in the diff and updated the Playwright locator.`,
      confidence: 0.91,
      findText: content.includes(`getByTestId('${testIdReplacement.before}')`)
        ? `getByTestId('${testIdReplacement.before}')`
        : `getByTestId("${testIdReplacement.before}")`,
      content: `getByTestId('${escapeSingleQuotes(testIdReplacement.after)}')`,
    };
  }

  if (
    routeReplacement &&
    (content.includes(`page.goto('${routeReplacement.before}')`) ||
      content.includes(`page.goto("${routeReplacement.before}")`))
  ) {
    return {
      reason: `Detected navigation target rename ${routeReplacement.before} -> ${routeReplacement.after} in the diff and updated the test route.`,
      confidence: 0.86,
      findText: content.includes(`page.goto('${routeReplacement.before}')`)
        ? `page.goto('${routeReplacement.before}')`
        : `page.goto("${routeReplacement.before}")`,
      content: `page.goto('${escapeSingleQuotes(routeReplacement.after)}')`,
    };
  }

  if (
    hrefReplacement &&
    (content.includes(`href="${hrefReplacement.before}"`) ||
      content.includes(`href='${hrefReplacement.before}'`))
  ) {
    return {
      reason: `Detected href rename ${hrefReplacement.before} -> ${hrefReplacement.after} in the diff and updated the selector target.`,
      confidence: 0.79,
      findText: content.includes(`href="${hrefReplacement.before}"`)
        ? `href="${hrefReplacement.before}"`
        : `href='${hrefReplacement.before}'`,
      content: `href="${escapeSingleQuotes(hrefReplacement.after)}"`,
    };
  }

  if (
    ariaReplacement &&
    (content.includes(`getByLabel('${ariaReplacement.before}')`) ||
      content.includes(`getByLabel("${ariaReplacement.before}")`) ||
      content.includes(`name: '${ariaReplacement.before}'`) ||
      content.includes(`name: "${ariaReplacement.before}"`))
  ) {
    const beforeLabel = content.includes(`getByLabel('${ariaReplacement.before}')`)
      ? `getByLabel('${ariaReplacement.before}')`
      : content.includes(`getByLabel("${ariaReplacement.before}")`)
        ? `getByLabel("${ariaReplacement.before}")`
        : content.includes(`name: '${ariaReplacement.before}'`)
          ? `name: '${ariaReplacement.before}'`
          : `name: "${ariaReplacement.before}"`;
    const afterLabel = beforeLabel.startsWith('getByLabel')
      ? `getByLabel('${escapeSingleQuotes(ariaReplacement.after)}')`
      : `name: '${escapeSingleQuotes(ariaReplacement.after)}'`;

    return {
      reason: `Detected aria-label rename "${ariaReplacement.before}" -> "${ariaReplacement.after}" in the diff and updated the accessible locator.`,
      confidence: 0.87,
      findText: beforeLabel,
      content: afterLabel,
    };
  }

  if (
    roleReplacement &&
    (content.includes(`getByRole('${roleReplacement.before}'`) ||
      content.includes(`getByRole("${roleReplacement.before}"`) ||
      content.includes(`[role="${roleReplacement.before}"]`))
  ) {
    const findText = content.includes(`getByRole('${roleReplacement.before}'`)
      ? `getByRole('${roleReplacement.before}'`
      : content.includes(`getByRole("${roleReplacement.before}"`)
        ? `getByRole("${roleReplacement.before}"`
        : `[role="${roleReplacement.before}"]`;
    const nextContent = findText.startsWith('getByRole')
      ? findText.replace(roleReplacement.before, roleReplacement.after)
      : `[role="${escapeSingleQuotes(roleReplacement.after)}"]`;

    return {
      reason: `Detected role rename ${roleReplacement.before} -> ${roleReplacement.after} in the diff and updated the locator role.`,
      confidence: 0.82,
      findText,
      content: nextContent,
    };
  }

  if (classReplacement && content.includes(`page.locator('.${classReplacement.before}')`)) {
    return {
      reason: `Detected selector rename .${classReplacement.before} -> .${classReplacement.after} in the diff and updated the locator to match.`,
      confidence: 0.84,
      findText: `page.locator('.${classReplacement.before}')`,
      content: `page.locator('.${escapeSingleQuotes(classReplacement.after)}')`,
    };
  }

  if (
    textReplacement &&
    issueLower.includes('role') &&
    content.includes(`getByRole('button', { name: '${textReplacement.before}' })`)
  ) {
    return {
      reason: `Detected text rename "${textReplacement.before}" -> "${textReplacement.after}" in the diff and updated the role locator label.`,
      confidence: 0.88,
      findText: `getByRole('button', { name: '${escapeSingleQuotes(textReplacement.before)}' })`,
      content: `getByRole('button', { name: '${escapeSingleQuotes(textReplacement.after)}' })`,
    };
  }

  return null;
}

function tokenizePath(value: string) {
  return value
    .toLowerCase()
    .split(/[\/_.-]+/)
    .filter((token) => token.length >= 3 && !['spec', 'test', 'tests', 'src'].includes(token));
}

function tokenizeLines(lines: string[]) {
  return lines
    .flatMap((line) => line.toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 3);
}

function stripSemanticToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeCodeForMatching(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function resolvePlaywrightCliPath(repoPath: string) {
  let current = resolve(repoPath);

  while (true) {
    const candidate = join(current, 'node_modules', 'playwright', 'cli.js');
    try {
      require.resolve(candidate);
      return candidate;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  throw new Error('Could not resolve Playwright CLI from the repository or workspace');
}

function isConfiguredTestFile(filePath: string, settings: RepoSettings) {
  if (TEST_FILE_PATTERN.test(filePath)) {
    return true;
  }

  const normalizedPath = filePath.toLowerCase();
  return settings.testDirectories.some((directory) => {
    const normalizedDirectory = directory.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
    return normalizedPath.startsWith(`${normalizedDirectory}/`);
  });
}

function isConfiguredSourceFile(filePath: string, settings: RepoSettings) {
  if (!SOURCE_FILE_PATTERN.test(filePath) || isConfiguredTestFile(filePath, settings)) {
    return false;
  }

  const normalizedPath = filePath.toLowerCase();
  return settings.sourceDirectories.some((directory) => {
    const normalizedDirectory = directory.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
    return normalizedPath.startsWith(`${normalizedDirectory}/`);
  });
}

function intersectTokens(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token));
}

function sameBasenameFamily(left: string, right: string) {
  const leftName = basenameWithoutExtensions(left);
  const rightName = basenameWithoutExtensions(right);
  return leftName === rightName || leftName.includes(rightName) || rightName.includes(leftName);
}

function basenameWithoutExtensions(value: string) {
  const parts = value.split('/');
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.(spec|test)\./g, '.').replace(/\.[^.]+$/g, '');
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values));
}

function confidenceLevelFromValue(value: number): ConfidenceLevel {
  if (value >= 0.85) {
    return 'high';
  }
  if (value >= 0.65) {
    return 'medium';
  }
  return 'low';
}

function confidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score >= 7) {
    return 'high';
  }
  if (score >= 4) {
    return 'medium';
  }
  return 'low';
}

function clamp01(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

function createDefaultPolicy(): RepoPolicy {
  return {
    patchAllow: [],
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
      maxTests: 5,
    },
  };
}

function resolvePolicySource(
  settings: RepoSettings,
  policyMode: PolicyMode,
  overrides: { applyThresholdOverride?: number; verifyThresholdOverride?: number } = {}
): PolicySource {
  if (
    policyMode !== 'auto' ||
    typeof overrides.applyThresholdOverride === 'number' ||
    typeof overrides.verifyThresholdOverride === 'number'
  ) {
    return 'cli_override';
  }

  return settings.policySource;
}

function buildRepoMemorySummary(memory: AutoQaRepoMemory): RepoMemorySummary {
  const failingCounts = new Map<string, number>();
  const failedRuns = memory.recentFailures.filter((entry) => entry.status === 'failed');

  for (const failure of failedRuns) {
    for (const testFile of failure.tests) {
      failingCounts.set(testFile, (failingCounts.get(testFile) ?? 0) + 1);
    }
  }

  return {
    knownFlakyTests: memory.knownFlakyTests.length,
    recentFailures: memory.recentFailures.length,
    failedRuns: failedRuns.length,
    acceptedPatches: memory.acceptedPatches.length,
    rejectedPatches: memory.rejectedPatches.length,
    topFailingTests: Array.from(failingCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([file, count]) => ({ file, count })),
  };
}

function isNoDiffError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /No changed files|No unstaged working tree changes found|No staged working tree changes found|No changed files available for analysis/i.test(
    message
  );
}

function matchesGlobLike(inputPath: string, pattern: string) {
  const normalizedPath = inputPath.split(sep).join('/').toLowerCase();
  const normalizedPattern = pattern.split(sep).join('/').toLowerCase().trim();
  if (!normalizedPattern) {
    return false;
  }
  if (!normalizedPattern.includes('*')) {
    const prefix = normalizedPattern.endsWith('/') ? normalizedPattern.slice(0, -1) : normalizedPattern;
    return (
      normalizedPath === prefix ||
      normalizedPath.startsWith(`${prefix}/`) ||
      normalizedPath.includes(`/${prefix}/`)
    );
  }

  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(normalizedPath);
}

async function readCurrentBranch(repoPath: string) {
  return execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath })
    .then(({ stdout }) => stdout.trim())
    .catch(() => '');
}

function isReportOnlyBranch(policy: RepoPolicy, branchName: string) {
  if (!branchName) {
    return false;
  }
  return policy.branch.reportOnly.some((pattern) => matchesGlobLike(branchName, pattern));
}

function evaluatePatchPolicy(
  policy: RepoPolicy,
  targetFile: string,
  confidence: number,
  requestedApply: boolean,
  branchName: string,
  policyMode: PolicyMode,
  applyThresholdOverride?: number
) {
  const blockedReasons: string[] = [];
  const blockedReasonCodes: PolicyReasonCode[] = [];
  const normalizedTarget = targetFile.split(sep).join('/');
  const allowHit =
    policy.patchAllow.length === 0 ||
    policy.patchAllow.some((pattern) => matchesGlobLike(normalizedTarget, pattern));
  const denyHit = policy.patchDeny.some((pattern) => matchesGlobLike(normalizedTarget, pattern));
  const protectedHit = policy.protectedFiles.some((pattern) => matchesGlobLike(normalizedTarget, pattern));
  const reportOnly = policyMode === 'report_only' || isReportOnlyBranch(policy, branchName);
  const applyThreshold =
    policyMode === 'enforce' || policyMode === 'auto'
      ? clamp01(applyThresholdOverride ?? policy.confidenceThresholds.apply, policy.confidenceThresholds.apply)
      : 0;

  if (!allowHit) {
    blockedReasons.push(`target file not in patch allow list (${normalizedTarget})`);
    blockedReasonCodes.push('not_in_allow_list');
  }
  if (denyHit) {
    blockedReasons.push(`target file matched patch deny rule (${normalizedTarget})`);
    blockedReasonCodes.push('matched_deny_rule');
  }
  if (protectedHit) {
    blockedReasons.push(`target file matched protected file rule (${normalizedTarget})`);
    blockedReasonCodes.push('protected_file');
  }
  if (reportOnly) {
    blockedReasons.push(
      policyMode === 'report_only'
        ? 'CLI policyMode=report_only disabled apply'
        : `branch ${branchName} is configured as report_only`
    );
    blockedReasonCodes.push('branch_report_only');
  }
  if (requestedApply && confidence < applyThreshold) {
    blockedReasons.push(
      `confidence ${confidence.toFixed(2)} below apply threshold ${applyThreshold.toFixed(2)}`
    );
    blockedReasonCodes.push('below_apply_threshold');
  }

  return {
    mode: policyMode,
    applyThreshold,
    blockedReasons,
    blockedReasonCodes,
    shouldApply: requestedApply && blockedReasons.length === 0,
  };
}

function getCachedValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string) {
  const hit = cache.get(key);
  if (!hit) {
    return null;
  }

  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }

  return hit.value;
}

function setCachedValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T) {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

async function loadRepoSettings(repoPath: string): Promise<RepoSettings> {
  const cached = getCachedValue(repoSettingsCache, repoPath);
  if (cached) {
    return cached;
  }

  const defaultSettings: RepoSettings = {
    ignorePatterns: [],
    testDirectories: ['tests', 'test', 'e2e', 'specs'],
    sourceDirectories: ['src'],
    policy: createDefaultPolicy(),
    policySource: 'default',
  };

  const ignoreFile = await readFile(join(repoPath, '.autoqaignore'), 'utf8').catch(() => '');
  const configFile = await readFile(join(repoPath, 'autoqa.config.json'), 'utf8').catch(() => '');
  const ignorePatterns = ignoreFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (!configFile) {
    const settings: RepoSettings = {
      ...defaultSettings,
      ignorePatterns: dedupeStrings(ignorePatterns),
    };
    setCachedValue(repoSettingsCache, repoPath, settings);
    return settings;
  }

  try {
    const parsed = JSON.parse(configFile) as Partial<{
      ignore: string[];
      testDirectories: string[];
      sourceDirectories: string[];
      policy: {
        patchAllow?: string[];
        patchDeny?: string[];
        protectedFiles?: string[];
        confidenceThresholds?: {
          suggest?: number;
          apply?: number;
          verify?: number;
        };
        branch?: {
          reportOnly?: string[];
        };
        testBudget?: {
          maxTests?: number;
        };
      };
    }>;

    const parsedPolicy = parsed.policy ?? {};
    const basePolicy = createDefaultPolicy();
    const hasPolicyConfig = Boolean(parsed.policy && typeof parsed.policy === 'object');
    const policy: RepoPolicy = {
      patchAllow: Array.isArray(parsedPolicy.patchAllow) ? parsedPolicy.patchAllow : basePolicy.patchAllow,
      patchDeny: Array.isArray(parsedPolicy.patchDeny) ? parsedPolicy.patchDeny : basePolicy.patchDeny,
      protectedFiles: Array.isArray(parsedPolicy.protectedFiles)
        ? parsedPolicy.protectedFiles
        : basePolicy.protectedFiles,
      confidenceThresholds: {
        suggest: clamp01(parsedPolicy.confidenceThresholds?.suggest ?? basePolicy.confidenceThresholds.suggest, basePolicy.confidenceThresholds.suggest),
        apply: clamp01(parsedPolicy.confidenceThresholds?.apply ?? basePolicy.confidenceThresholds.apply, basePolicy.confidenceThresholds.apply),
        verify: clamp01(parsedPolicy.confidenceThresholds?.verify ?? basePolicy.confidenceThresholds.verify, basePolicy.confidenceThresholds.verify),
      },
      branch: {
        reportOnly: Array.isArray(parsedPolicy.branch?.reportOnly)
          ? parsedPolicy.branch?.reportOnly
          : basePolicy.branch.reportOnly,
      },
      testBudget: {
        maxTests:
          typeof parsedPolicy.testBudget?.maxTests === 'number' && parsedPolicy.testBudget.maxTests > 0
            ? Math.max(1, Math.min(50, Math.floor(parsedPolicy.testBudget.maxTests)))
            : basePolicy.testBudget.maxTests,
      },
    };

    const settings: RepoSettings = {
      ignorePatterns: dedupeStrings([...ignorePatterns, ...(parsed.ignore ?? [])]),
      testDirectories: parsed.testDirectories?.length
        ? parsed.testDirectories
        : defaultSettings.testDirectories,
      sourceDirectories: parsed.sourceDirectories?.length
        ? parsed.sourceDirectories
        : defaultSettings.sourceDirectories,
      policy,
      policySource: hasPolicyConfig ? 'repo_config' : 'default',
    };
    setCachedValue(repoSettingsCache, repoPath, settings);
    return settings;
  } catch {
    const settings: RepoSettings = {
      ...defaultSettings,
      ignorePatterns: dedupeStrings(ignorePatterns),
    };
    setCachedValue(repoSettingsCache, repoPath, settings);
    return settings;
  }
}

function shouldIgnorePath(relativePath: string, settings: RepoSettings) {
  const normalizedPath = relativePath.split(sep).join('/').toLowerCase();
  const pathSegments = normalizedPath.split('/').filter(Boolean);

  if (pathSegments.some((segment) => IGNORED_DIRECTORIES.has(segment))) {
    return true;
  }

  return settings.ignorePatterns.some((pattern) => {
    const normalizedPattern = pattern.split(sep).join('/').toLowerCase();
    if (!normalizedPattern.includes('*')) {
      const prefix = normalizedPattern.endsWith('/') ? normalizedPattern : `${normalizedPattern}`;
      return (
        normalizedPath === prefix ||
        normalizedPath.startsWith(`${prefix}/`) ||
        normalizedPath.includes(`/${prefix}/`)
      );
    }

    const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(normalizedPath);
  });
}

async function listUntrackedFiles(repoPath: string) {
  const { stdout } = await execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: repoPath,
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(sep).join('/'));
}

async function resolveAutoBase(repoPath: string) {
  const upstream = await execFileAsync(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    { cwd: repoPath }
  )
    .then(({ stdout }) => stdout.trim())
    .catch(() => '');

  const candidateRefs = upstream
    ? [upstream]
    : ['origin/main', 'origin/master', 'main', 'master'];

  let compareRef = '';
  for (const ref of candidateRefs) {
    const exists = await execFileAsync('git', ['rev-parse', '--verify', ref], { cwd: repoPath })
      .then(() => true)
      .catch(() => false);
    if (exists) {
      compareRef = ref;
      break;
    }
  }

  if (!compareRef) {
    const hasParentCommit = await execFileAsync('git', ['rev-parse', '--verify', 'HEAD~1'], {
      cwd: repoPath,
    })
      .then(() => true)
      .catch(() => false);
    if (hasParentCommit) {
      return {
        compareRef: 'HEAD~1',
        mergeBase: 'HEAD~1',
      };
    }

    throw new Error('Could not resolve an automatic merge-base reference');
  }

  const { stdout } = await execFileAsync('git', ['merge-base', 'HEAD', compareRef], { cwd: repoPath });
  const mergeBase = stdout.trim();
  if (!mergeBase) {
    throw new Error(`Could not resolve merge-base for HEAD and ${compareRef}`);
  }

  return {
    compareRef,
    mergeBase,
  };
}

async function resolveChangedFiles(
  repoPath: string,
  changedFiles: string[] | undefined,
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean | undefined,
  staged: boolean | undefined,
  autoBase: boolean | undefined
) {
  const absoluteRepoPath = await resolveDirectoryPath(repoPath);
  const settings = await loadRepoSettings(absoluteRepoPath);

  if (workingTree) {
    const diffArgs = ['diff', '--name-only'];
    if (staged) {
      diffArgs.push('--cached');
    }

    const { stdout } = await execFileAsync('git', diffArgs, { cwd: absoluteRepoPath });
    const trackedFiles = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(sep).join('/'));
    const untrackedFiles = staged
      ? []
      : await listUntrackedFiles(absoluteRepoPath);
    const files = dedupeStrings([...trackedFiles, ...untrackedFiles]).filter(
      (file) => !shouldIgnorePath(file, settings)
    );

    if (!files.length) {
      throw new Error(`No ${staged ? 'staged' : 'unstaged'} working tree changes found`);
    }

    return {
      changedFiles: files,
      diffSource: {
        mode: 'working_tree' as const,
        staged: Boolean(staged),
      },
      untrackedFiles: untrackedFiles.filter((file) => !shouldIgnorePath(file, settings)),
    };
  }

  if (autoBase) {
    const autoBaseInfo = await resolveAutoBase(absoluteRepoPath);
    const args = ['diff', '--name-only', autoBaseInfo.mergeBase, 'HEAD'];
    const { stdout } = await execFileAsync('git', args, { cwd: absoluteRepoPath });
    const files = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(sep).join('/'))
      .filter((line) => !shouldIgnorePath(line, settings));

    if (!files.length) {
      throw new Error(`No changed files found from auto merge-base against ${autoBaseInfo.compareRef}`);
    }

    return {
      changedFiles: files,
      diffSource: {
        mode: 'git' as const,
        baseRef: autoBaseInfo.mergeBase,
        headRef: 'HEAD',
        autoBase: true,
        compareRef: autoBaseInfo.compareRef,
      },
      untrackedFiles: [] as string[],
    };
  }

  if (baseRef) {
    const args = ['diff', '--name-only', baseRef];
    if (headRef) {
      args.push(headRef);
    }

    const { stdout } = await execFileAsync('git', args, { cwd: absoluteRepoPath });
    const files = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(sep).join('/'));

    if (!files.length) {
      throw new Error(
        `No changed files found from git diff ${baseRef}${headRef ? `..${headRef}` : ''}`
      );
    }

    return {
      changedFiles: files,
      diffSource: {
        mode: 'git' as const,
        baseRef,
        headRef,
      },
      untrackedFiles: [] as string[],
    };
  }

  if (!changedFiles?.length) {
    throw new Error('No changed files available for analysis');
  }

  return {
      changedFiles: changedFiles
        .map((file) => file.split(sep).join('/'))
        .filter((file) => !shouldIgnorePath(file, settings)),
    diffSource: {
      mode: 'manual' as const,
    },
    untrackedFiles: [] as string[],
  };
}

async function loadDiffSignals(
  repoPath: string,
  changedFiles: string[],
  baseRef: string | undefined,
  headRef: string | undefined,
  workingTree: boolean = false,
  staged: boolean = false,
  untrackedFiles: string[] = []
) {
  const cacheKey = JSON.stringify({
    repoPath,
    changedFiles,
    baseRef,
    headRef,
    workingTree,
    staged,
    untrackedFiles,
  });
  const cached = getCachedValue(diffSignalCache, cacheKey);
  if (cached) {
    return cached;
  }

  if (!baseRef && !workingTree) {
    const signals = changedFiles.map((file) => ({
      file,
      addedLines: [],
      removedLines: [],
      changeTypes: classifyChangeTypes([], []),
      semanticReplacements: [],
    }));
    setCachedValue(diffSignalCache, cacheKey, signals);
    return signals;
  }

  const signals: DiffSignal[] = [];
  const untrackedSet = new Set(untrackedFiles);

  for (const file of changedFiles) {
    if (workingTree && untrackedSet.has(file)) {
      const absoluteFilePath = resolveRepoRelativePath(repoPath, file);
      const content = await readFile(absoluteFilePath, 'utf8').catch(() => '');
      const addedLines = content.split(/\r?\n/).filter(Boolean);
      signals.push({
        file,
        addedLines,
        removedLines: [],
        changeTypes: classifyChangeTypes(addedLines, []),
        semanticReplacements: extractSemanticReplacements(addedLines, []),
      });
      continue;
    }

    const args = ['diff', '--unified=0'];
    if (workingTree) {
      if (staged) {
        args.push('--cached');
      }
    } else {
      args.push(baseRef as string);
      if (headRef) {
        args.push(headRef);
      }
    }
    args.push('--', file);

    const { stdout } = await execFileAsync('git', args, { cwd: repoPath });
    const addedLines = stdout
      .split(/\r?\n/)
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1));
    const removedLines = stdout
      .split(/\r?\n/)
      .filter((line) => line.startsWith('-') && !line.startsWith('---'))
      .map((line) => line.slice(1));

    signals.push({
      file,
      addedLines,
      removedLines,
      changeTypes: classifyChangeTypes(addedLines, removedLines),
      semanticReplacements: extractSemanticReplacements(addedLines, removedLines),
    });
  }

  setCachedValue(diffSignalCache, cacheKey, signals);
  return signals;
}

function classifyChangeTypes(addedLines: string[], removedLines: string[]) {
  const combined = [...addedLines, ...removedLines].join('\n').toLowerCase();
  const changeTypes: string[] = [];

  if (
    combined.includes('locator(') ||
    combined.includes('getbyrole') ||
    combined.includes('getbytestid') ||
    combined.includes('getbylabel') ||
    combined.includes('classname') ||
    combined.includes('data-testid') ||
    combined.includes('aria-label') ||
    combined.includes('role=') ||
    combined.includes('href=')
  ) {
    changeTypes.push('selector');
  }

  if (combined.includes('login') || combined.includes('sign in') || combined.includes('text(')) {
    changeTypes.push('text');
  }

  if (
    combined.includes('page.goto') ||
    combined.includes('networkidle') ||
    combined.includes('route') ||
    combined.includes('href=')
  ) {
    changeTypes.push('navigation');
  }

  return dedupeStrings(changeTypes);
}

function extractSemanticReplacements(addedLines: string[], removedLines: string[]) {
  const replacements: SemanticReplacement[] = [];
  const pairCount = Math.min(addedLines.length, removedLines.length);

  for (let index = 0; index < pairCount; index += 1) {
    const added = addedLines[index];
    const removed = removedLines[index];

    collectRegexReplacement(
      replacements,
      'class',
      /className=["']([^"']+)["']/,
      removed,
      added
    );
    collectRegexReplacement(
      replacements,
      'testid',
      /data-testid=["']([^"']+)["']/,
      removed,
      added
    );
    collectRegexReplacement(
      replacements,
      'route',
      /page\.goto\((['"])(.*?)\1\)/,
      removed,
      added
    );
    collectRegexReplacement(
      replacements,
      'href',
      /href=["']([^"']+)["']/,
      removed,
      added
    );
    collectRegexReplacement(
      replacements,
      'aria-label',
      /aria-label=["']([^"']+)["']/,
      removed,
      added
    );
    collectRegexReplacement(
      replacements,
      'role',
      /role=["']([^"']+)["']/,
      removed,
      added
    );

    const removedTexts = extractVisibleTexts(removed);
    const addedTexts = extractVisibleTexts(added);
    const textPairCount = Math.min(removedTexts.length, addedTexts.length);
    for (let textIndex = 0; textIndex < textPairCount; textIndex += 1) {
      const before = removedTexts[textIndex].trim();
      const after = addedTexts[textIndex].trim();
      if (before && after && before !== after) {
        replacements.push({
          kind: 'text',
          before,
          after,
        });
      }
    }
  }

  return dedupeSemanticReplacements(replacements);
}

function collectRegexReplacement(
  replacements: SemanticReplacement[],
  kind: SemanticReplacement['kind'],
  pattern: RegExp,
  removedLine: string,
  addedLine: string
) {
  const before = removedLine.match(pattern)?.[kind === 'route' ? 2 : 1]?.trim();
  const after = addedLine.match(pattern)?.[kind === 'route' ? 2 : 1]?.trim();

  if (before && after && before !== after) {
    replacements.push({
      kind,
      before,
      after,
    });
  }
}

function extractVisibleTexts(line: string) {
  return Array.from(line.matchAll(/>([^<>]+)</g), (match) => match[1]).filter(Boolean);
}

function dedupeSemanticReplacements(values: SemanticReplacement[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.kind}:${value.before}:${value.after}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) {
    return 0;
  }

  return haystack.split(needle).length - 1;
}

function buildPreview(value: string) {
  const lines = value.split('\n');
  return lines.slice(Math.max(lines.length - 8, 0)).join('\n');
}

function buildUnifiedDiff(filePath: string, before: string, after: string) {
  const normalizedPath = filePath.split(sep).join('/');

  if (before === after) {
    return `--- a/${normalizedPath}\n+++ b/${normalizedPath}\n`;
  }

  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  let start = 0;
  while (
    start < beforeLines.length &&
    start < afterLines.length &&
    beforeLines[start] === afterLines[start]
  ) {
    start += 1;
  }

  let endBefore = beforeLines.length - 1;
  let endAfter = afterLines.length - 1;
  while (endBefore >= start && endAfter >= start && beforeLines[endBefore] === afterLines[endAfter]) {
    endBefore -= 1;
    endAfter -= 1;
  }

  const removed = beforeLines.slice(start, endBefore + 1);
  const added = afterLines.slice(start, endAfter + 1);
  const beforeCount = removed.length;
  const afterCount = added.length;
  const hunkStart = start + 1;

  return [
    `--- a/${normalizedPath}`,
    `+++ b/${normalizedPath}`,
    `@@ -${hunkStart},${beforeCount} +${hunkStart},${afterCount} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].join('\n');
}

function escapeSingleQuotes(value: string) {
  return value.replace(/'/g, "\\'");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AutoQA MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
