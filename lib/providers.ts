import { Agent, fetch as undiciFetch } from 'undici';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ProviderId } from './config';

/**
 * Which models can actually do this job, asked of the provider rather than
 * hardcoded.
 *
 * A hardcoded list is wrong within a month. Worse, an unfiltered list is a menu
 * of ways to fail: driving a desktop needs tool calling *and* vision, and most
 * models have neither.
 */

export type ModelChoice = { id: string; label: string; note?: string };

export const PROVIDERS: { id: ProviderId; label: string; keyHint: string; keyUrl: string }[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'openrouter', label: 'OpenRouter', keyHint: 'sk-or-…', keyUrl: 'https://openrouter.ai/keys' },
];

/**
 * Anthropic and OpenAI expose no capability flags on /v1/models, so their
 * lists are filtered by name. This is the part of the file that will rot, which
 * is why it is a filter over a live list rather than a list of its own: a new
 * model appears without a code change, an unsuitable one is only hidden.
 */
const SUITABLE = {
  anthropic: (id: string) => /claude/.test(id) && !/haiku-3|instant|claude-2/.test(id),
  openai: (id: string) => /^(gpt-5|gpt-4\.1|gpt-4o|o[34])/.test(id) && !/audio|realtime|transcribe|tts|embedding|image/.test(id),
};

export async function listModels(provider: ProviderId, apiKey: string): Promise<ModelChoice[]> {
  if (provider === 'openrouter') {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(await describe(response));
    const { data } = await response.json();
    return data
      // The two capabilities this app cannot work without, stated by the
      // provider rather than guessed from the name.
      .filter((m: any) => m.supported_parameters?.includes('tools')
        && m.architecture?.input_modalities?.includes('image'))
      .map((m: any) => ({
        id: m.id,
        label: m.name ?? m.id,
        note: m.pricing?.prompt
          ? `$${(Number(m.pricing.prompt) * 1e6).toFixed(2)}/M in`
          : undefined,
      }))
      .sort((a: ModelChoice, b: ModelChoice) => a.label.localeCompare(b.label));
  }

  const base = provider === 'anthropic' ? 'https://api.anthropic.com/v1/models' : 'https://api.openai.com/v1/models';
  const headers: Record<string, string> = provider === 'anthropic'
    ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    : { authorization: `Bearer ${apiKey}` };

  const response = await fetch(base, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(await describe(response));

  const body = await response.json();
  const models: any[] = body.data ?? [];
  const keep = SUITABLE[provider];

  return models
    .filter((m) => keep(m.id))
    .map((m) => ({ id: m.id, label: m.display_name ?? m.id }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

async function describe(response: Response) {
  const text = await response.text();
  if (response.status === 401) return 'That key was rejected.';
  if (response.status === 403) return 'That key is not allowed to list models.';
  try {
    return JSON.parse(text)?.error?.message ?? `The provider answered ${response.status}.`;
  } catch {
    return `The provider answered ${response.status}.`;
  }
}

// Node versions with HTTP/2 enabled by default can leave long tool-loop streams
// attached to a destroyed session. Keep provider requests on HTTP/1.1.
const providerDispatcher = new Agent({ allowH2: false });
const providerFetch = ((input: Parameters<typeof undiciFetch>[0], init: Parameters<typeof undiciFetch>[1]) => undiciFetch(input, {
  ...init,
  dispatcher: providerDispatcher,
})) as unknown as typeof fetch;

/** Build a model handle the agent can use. */
export function modelFor(provider: ProviderId, apiKey: string, model: string) {
  if (provider === 'anthropic') return createAnthropic({ apiKey, fetch: providerFetch })(model);
  if (provider === 'openai') return createOpenAI({ apiKey, fetch: providerFetch })(model);
  return createOpenRouter({ apiKey, fetch: providerFetch })(model);
}
