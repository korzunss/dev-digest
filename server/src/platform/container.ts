import type {
  AuthProvider,
  SecretsProvider,
  ForgeClient,
  ForgeProvider,
  GitClient,
  RunnerBundleSource,
  CodeIndex,
  Embedder,
  LLMProvider,
  Provider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import type { AgentRow } from '../db/rows.js';
import type { EvalAgent, EvalSkillsPort } from '../modules/eval/types.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { GitLabRestClient } from '../adapters/gitlab/rest.js';
import { forgeCacheKey, forgeTokenKeys } from './forge-resolve.js';
import { FsRunnerBundleSource } from '../adapters/runner-bundle/fs.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider, reviewPullRequest } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError, NotFoundError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { PullsRepository } from '../modules/pulls/repository.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { IntentService } from '../modules/intent/service.js';
import { IntentRepository } from '../modules/intent/repository.js';
import { BriefService } from '../modules/brief/service.js';
import { BriefRepository } from '../modules/brief/repository.js';
import { SmartDiffService } from '../modules/smart-diff/service.js';
import { SmartDiffRepository } from '../modules/smart-diff/repository.js';
import { BlastService } from '../modules/blast/service.js';
import { BlastRepository } from '../modules/blast/repository.js';
import { ContextService } from '../modules/context/service.js';
import { EvalPipelineService } from '../modules/eval/pipeline-service.js';
import { EvalPipelineRepository } from '../modules/eval/repository/pipeline.repo.js';
import { EvalSkillSuiteService } from '../modules/eval/skill-suite-service.js';
import { EVAL_CASE_CALL_DEADLINE_MS } from '../modules/eval/constants.js';
import { CiService } from '../modules/ci/service.js';
import { CiRepository } from '../modules/ci/repository.js';
import { ReviewService } from '../modules/reviews/service.js';
import { AgentsService } from '../modules/agents/service.js';
import {
  REVIEW_MAX_OUTPUT_TOKENS,
  REVIEW_MAX_SKIPPED_CHUNK_FRACTION,
  REVIEW_RETRY_ROUTING,
  REVIEW_ROUTING,
} from '../modules/reviews/constants.js';
import { renderSkillBlock } from '../modules/skills/helpers.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { resolveFeatureModel } from '../modules/settings/feature-models.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  /**
   * Forge client(s) for tests. Either one client used for every provider, or a
   * per-provider map — accepting both keeps the common single-mock case to one
   * line while a mixed-forge test can inject two.
   */
  forge?: ForgeClient | Partial<Record<ForgeProvider, ForgeClient>>;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  /** Export-to-CI: where the committed agent-runner bundle is read from. */
  runnerBundle?: RunnerBundleSource;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private forgeCache = new Map<string, ForgeClient>();
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _skillsRepo?: SkillsRepository;
  private _reviewRepo?: ReviewRepository;
  private _pullsRepo?: PullsRepository;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;
  private _intent?: IntentService;
  private _smartDiff?: SmartDiffService;
  private _blast?: BlastService;
  private _brief?: BriefService;
  private _ci?: CiService;
  private _context?: ContextService;
  private _evalPipeline?: EvalPipelineService;
  private _evalSkillSuite?: EvalSkillSuiteService;
  private _evalPipelineRepo?: EvalPipelineRepository;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get skillsRepo(): SkillsRepository {
    return (this._skillsRepo ??= new SkillsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get pullsRepo(): PullsRepository {
    return (this._pullsRepo ??= new PullsRepository(this.db));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /**
   * PR intent classification + persistence facade (spec 006). Reached as
   * `container.intent` by `run-executor.ts` and `modules/intent/routes.ts`,
   * same pattern as `container.repoIntel`. Built from narrow `IntentServiceDeps`
   * (D10-A) — this getter is the ONLY place that knows both `IntentService`
   * and `Container`, which is what breaks the constructor-level DI cycle.
   */
  get intent(): IntentService {
    return (this._intent ??= new IntentService({
      repo: new IntentRepository(this.db),
      git: this.git,
      forge: (ref) => this.forge(ref),
      llm: (id) => this.llm(id),
      tokenizer: this.tokenizer,
      resolveModel: (workspaceId, id) => resolveFeatureModel(this, workspaceId, id),
    }));
  }

  /** Smart Diff (S6, spec 007) — reviewer-ordered Files-changed grouping. */
  get smartDiff(): SmartDiffService {
    return (this._smartDiff ??= new SmartDiffService({ repo: new SmartDiffRepository(this.db) }));
  }

  /** Blast Radius — impact map over the repo index + Prior PRs from the forge. */
  get blast(): BlastService {
    return (this._blast ??= new BlastService({
      repo: new BlastRepository(this.db),
      repoIntel: this.repoIntel,
      forge: (ref) => this.forge(ref),
    }));
  }

  /**
   * PR Brief (spec 010). Reaches intent, blast, smart-diff, agents and the
   * context reader through their existing getters — this getter is the only
   * place that knows the concrete services. One instance per app: it holds the
   * in-flight guard.
   */
  get brief(): BriefService {
    return (this._brief ??= new BriefService({
      repo: new BriefRepository(this.db),
      intent: this.intent,
      blast: this.blast,
      smartDiff: this.smartDiff,
      agents: this.agentsRepo,
      context: this.context,
      llm: (id) => this.llm(id),
      tokenizer: this.tokenizer,
      resolveModel: (workspaceId, id) => resolveFeatureModel(this, workspaceId, id),
    }));
  }

  /**
   * Export-to-CI (plan 40). Agents come from the shared agents repo, the forge
   * per repo, and the runner bundle from the fs adapter (path from config).
   * One instance per app: it holds the refresh in-flight guard.
   */
  get ci(): CiService {
    return (this._ci ??= new CiService({
      repo: new CiRepository(this.db),
      agents: this.agentsRepo,
      forge: (ref) => this.forge(ref),
      bundle: this.overrides.runnerBundle ?? new FsRunnerBundleSource(this.config.agentRunnerBundle),
    }));
  }

  /** Project-context documents (spec 008) — the one safe reader for HTTP and review runs. */
  get context(): ContextService {
    return (this._context ??= new ContextService({
      db: this.db,
      git: this.git,
      tokenizer: this.tokenizer,
    }));
  }

  /**
   * Eval pipeline (plan 34) — regression suites per agent. One instance per app:
   * it holds the in-flight suite-run guard and the draft-run tokens. Agents,
   * reviews and skills are reached through narrow ports built here, the only
   * place that knows both sides. A case run uses the review engine with the
   * same call options as a studio review, and a 240 s deadline.
   */
  get evalPipeline(): EvalPipelineService {
    if (this._evalPipeline) return this._evalPipeline;
    const agentsRepo = this.agentsRepo;
    const skillsRepo = this.skillsRepo;
    const agentsService = new AgentsService(this);
    this._evalPipeline = new EvalPipelineService({
      repo: this.evalPipelineRepo,
      agents: {
        getById: async (workspaceId, id) => {
          const row = await agentsRepo.getById(workspaceId, id);
          return row ? toEvalAgent(row) : undefined;
        },
        listAll: async (workspaceId) => (await agentsRepo.list(workspaceId)).map(toEvalAgent),
        skillsFor: async (agentId) =>
          (await agentsRepo.linkedSkills(agentId)).map((l) => ({
            id: l.skill.id,
            name: l.skill.name,
            version: l.skill.version,
            enabled: l.skill.enabled,
            rendered: renderSkillBlock(l.skill.name, l.skill.body),
          })),
        existingSkillIds: (workspaceId, ids) => skillsRepo.idsInWorkspace(workspaceId, ids),
        versionConfig: async (agentId, version) =>
          ((await agentsRepo.getVersion(agentId, version))?.configJson as Record<string, unknown> | undefined) ??
          null,
      },
      skills: this.evalSkillsPort,
      skillCases: this.evalSkillSuite,
      reviews: new ReviewService(this),
      promote: {
        promote: async (workspaceId, agentId, input) => {
          const out = await agentsService.promote(workspaceId, agentId, input);
          if (!out) throw new NotFoundError('Agent not found');
          return out;
        },
      },
      llm: (id) => this.llm(id),
      review: reviewPullRequest,
      parseDiff: parseUnifiedDiff,
      callOptions: {
        callDeadlineMs: EVAL_CASE_CALL_DEADLINE_MS,
        maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
        routing: REVIEW_ROUTING,
        retryRouting: REVIEW_RETRY_ROUTING,
        maxSkippedChunkFraction: REVIEW_MAX_SKIPPED_CHUNK_FRACTION,
      },
      countTokens: (s) => this.tokenizer.count(s),
      estimateCost: (model, tokensIn, tokensOut) => this.priceBook.estimate(model, tokensIn, tokensOut),
      now: () => new Date(),
    });
    return this._evalPipeline;
  }

  /** One repository for the agent and skill eval services. */
  private get evalPipelineRepo(): EvalPipelineRepository {
    return (this._evalPipelineRepo ??= new EvalPipelineRepository(this.db));
  }

  /** Skills as the eval services see them; the default pick is the first attached agent's (by name, disabled included). */
  private get evalSkillsPort(): EvalSkillsPort {
    const skillsRepo = this.skillsRepo;
    const agentsRepo = this.agentsRepo;
    return {
      getById: async (workspaceId, skillId) => {
        const row = await skillsRepo.getById(workspaceId, skillId);
        return row
          ? {
              id: row.id,
              name: row.name,
              version: row.version,
              enabled: row.enabled,
              rendered: renderSkillBlock(row.name, row.body),
            }
          : undefined;
      },
      agentsUsing: (workspaceId, skillId) => skillsRepo.agentsUsingSkill(workspaceId, skillId),
      defaultPick: async (workspaceId, skillId) => {
        const [first] = await skillsRepo.agentsUsingSkill(workspaceId, skillId);
        const agent = first ? await agentsRepo.getById(workspaceId, first.id) : undefined;
        return agent ? { provider: agent.provider as Provider, model: agent.model } : null;
      },
    };
  }

  /**
   * Skill eval suites (plan 35) — cases and runs per skill. One instance per app
   * (it holds the in-memory progress and draft tokens); same review engine and
   * call options as `evalPipeline`.
   */
  get evalSkillSuite(): EvalSkillSuiteService {
    return (this._evalSkillSuite ??= new EvalSkillSuiteService({
      repo: this.evalPipelineRepo,
      skills: this.evalSkillsPort,
      llm: (id) => this.llm(id),
      review: reviewPullRequest,
      parseDiff: parseUnifiedDiff,
      callOptions: {
        callDeadlineMs: EVAL_CASE_CALL_DEADLINE_MS,
        maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
        routing: REVIEW_ROUTING,
        retryRouting: REVIEW_RETRY_ROUTING,
        maxSkippedChunkFraction: REVIEW_MAX_SKIPPED_CHUNK_FRACTION,
      },
      countTokens: (s) => this.tokenizer.count(s),
      estimateCost: (model, tokensIn, tokensOut) => this.priceBook.estimate(model, tokensIn, tokensOut),
      now: () => new Date(),
    }));
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  /**
   * Resolve the forge client for a repo. Keyed by provider + instance, so one
   * workspace can hold GitHub repos alongside two different self-managed
   * GitLabs. A missing token throws ConfigError exactly as the old
   * `github()` did — every caller already degrades on that.
   */
  async forge(ref?: {
    provider?: ForgeProvider | null;
    apiBase?: string | null;
  }): Promise<ForgeClient> {
    const provider: ForgeProvider = ref?.provider ?? 'github';
    const apiBase = ref?.apiBase ?? null;

    const injected = this.overrides.forge;
    if (injected) {
      // A ForgeClient has methods; a per-provider map does not.
      if (typeof (injected as ForgeClient).listPullRequests === 'function') {
        return injected as ForgeClient;
      }
      const byProvider = (injected as Partial<Record<ForgeProvider, ForgeClient>>)[provider];
      if (byProvider) return byProvider;
    }

    const key = forgeCacheKey(provider, apiBase);
    const cached = this.forgeCache.get(key);
    if (cached) return cached;

    const client = await this.buildForge(provider, apiBase);
    this.forgeCache.set(key, client);
    return client;
  }

  private async buildForge(
    provider: ForgeProvider,
    apiBase: string | null,
  ): Promise<ForgeClient> {
    // Per-instance secret first (`GITLAB_TOKEN@git.acme.com`), then the plain
    // key. The per-instance form only ever resolves from the stored secrets
    // file — '@' is not legal in an env var name, so the env lookup for it
    // simply misses and falls through, which is the intended behaviour.
    for (const secretKey of forgeTokenKeys(provider, apiBase)) {
      const token = await this.secrets.get(secretKey);
      if (!token) continue;
      return provider === 'gitlab'
        ? new GitLabRestClient(token, apiBase)
        : new OctokitGitHubClient(token);
    }
    const [canonical] = forgeTokenKeys(provider, apiBase).slice(-1);
    throw new ConfigError(`${canonical} is not configured`);
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this.forgeCache.clear();
    this._embedder = undefined;
  }
}

/** An agent row as the eval pipeline's agents port sees it. */
function toEvalAgent(row: AgentRow): EvalAgent {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as Provider,
    model: row.model,
    systemPrompt: row.systemPrompt,
    strategy: row.strategy as EvalAgent['strategy'],
    version: row.version,
    enabled: row.enabled,
  };
}
