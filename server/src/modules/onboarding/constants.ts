/** Tunables for the Onboarding Tour generator (spec 009). */

/** Reading-path rows shown (AC-5). */
export const READING_PATH_MAX = 10;
/** Critical-path files shown (AC-6). */
export const CRITICAL_ROWS_MAX = 6;
/** First tasks kept after grounding. */
export const FIRST_TASKS_MAX = 5;
/** Ranked files fetched before the candidate filter drops tests/config/generated. */
export const TOP_FILES_FETCH = 50;
/** Endpoint facts handed to the model. */
export const ENDPOINTS_MAX = 40;
/** Root listing entries kept (structure). */
export const STRUCTURE_MAX = 40;
/** package.json scripts kept across all manifests. */
export const SCRIPTS_MAX = 40;
/** A script command is cut to this length (it is shown and copied). */
export const SCRIPT_COMMAND_MAX = 200;
/** First-level directories probed for their own package.json. */
export const PACKAGE_DIRS_MAX = 10;
/** A manifest larger than this is ignored, never read. */
export const MANIFEST_MAX_BYTES = 256 * 1024;
/** Cap on any error text that is stored or shown. */
export const ERROR_TEXT_MAX = 300;

/** Assumption: one call, no retries — a generous but bounded wait. */
export const ONBOARDING_LLM_TIMEOUT_MS = 90_000;
/** Assumption: five short sections fit well inside this. */
export const ONBOARDING_MAX_TOKENS = 4_000;
export const ONBOARDING_SCHEMA_NAME = 'onboarding_tour';
/** TQ4: the tour is generated in English. */
export const ONBOARDING_LANGUAGE = 'English';

/** Package-manager subcommands that need no `run`. */
export const PM_BUILTINS = ['install', 'i', 'ci'] as const;
/** Package managers a generated command may use. */
export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** Lockfile name -> package manager (first match wins, in this order). */
export const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
];

/** Root file present -> stack label. */
export const STACK_FILES: ReadonlyArray<readonly [string, string]> = [
  ['go.mod', 'Go'],
  ['pyproject.toml', 'Python'],
  ['requirements.txt', 'Python'],
  ['Cargo.toml', 'Rust'],
  ['Gemfile', 'Ruby'],
  ['pom.xml', 'Java (Maven)'],
  ['build.gradle', 'Java (Gradle)'],
  ['Dockerfile', 'Docker'],
];

/** Dependency name -> stack label. Only the label ever leaves the facts stage. */
export const STACK_DEPENDENCIES: Readonly<Record<string, string>> = {
  next: 'Next.js',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  '@angular/core': 'Angular',
  express: 'Express',
  fastify: 'Fastify',
  '@nestjs/core': 'NestJS',
  koa: 'Koa',
  hono: 'Hono',
  typescript: 'TypeScript',
  vitest: 'Vitest',
  jest: 'Jest',
  'drizzle-orm': 'Drizzle',
  prisma: 'Prisma',
  '@prisma/client': 'Prisma',
  typeorm: 'TypeORM',
  mongoose: 'MongoDB',
  pg: 'PostgreSQL',
  postgres: 'PostgreSQL',
  tailwindcss: 'Tailwind CSS',
  zod: 'Zod',
  vite: 'Vite',
  electron: 'Electron',
};

/** Env-example candidates, in preference order. */
export const ENV_EXAMPLE_NAMES = ['.env.example', '.env.sample'] as const;
/** Compose-file candidates, in preference order. */
export const COMPOSE_FILE_NAMES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yaml',
  'compose.yml',
] as const;
