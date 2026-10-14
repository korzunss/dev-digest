import type { ForgeClient, RepoRef } from '@devdigest/shared';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';

const clients = new Map<string, ForgeClient>();

export function forgeClientFor(repo: RepoRef, token: string): ForgeClient {
  const key = `${repo.provider ?? 'github'}:${repo.apiBase ?? ''}`;
  let client = clients.get(key);
  if (!client) {
    client = new OctokitGitHubClient(token);
    clients.set(key, client);
  }
  return client;
}
