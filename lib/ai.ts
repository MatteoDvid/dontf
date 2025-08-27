import {
  ExplainRequestSchema,
  ExplainResponseSchema,
  type ExplainRequest,
  type ExplainResponse,
} from './schemas';
import { ALL_TAGS } from './tags';

type CacheEntry = { value: ExplainResponse; expiresAt: number };
const inMemoryCache = new Map<string, CacheEntry>();

function computeCacheKey(input: ExplainRequest): string {
  return JSON.stringify(input);
}

function getTtlMs(): number {
  const hours = Number(process.env.AI_CACHE_TTL_HOURS ?? '6');
  return Math.max(1, hours) * 60 * 60 * 1000;
}

export async function getTagsForWizardSummary(
  input: ExplainRequest,
  options?: { allowedTags?: string[] },
): Promise<ExplainResponse> {
  const parsed = ExplainRequestSchema.parse(input);
  const key = computeCacheKey(parsed);
  const now = Date.now();
  const cached = inMemoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const aiEnabled = String(process.env.AI_ENABLED ?? 'false').toLowerCase() === 'true';
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || '1200');

  // Minimal fallback V1: return empty tags when AI disabled or no key
  let response: ExplainResponse = {
    tags: [],
    meta: { promptVersion: parsed.constraints.promptVersion },
  };

  if (aiEnabled && apiKey) {
    try {
      const allowlist = Array.isArray(options?.allowedTags) && options!.allowedTags!.length > 0
        ? (options!.allowedTags as string[])
        : ALL_TAGS;
      const system = [
        'Tu es un assistant de tagging de voyage. Réponds en JSON strict uniquement.',
        'Ne propose que des tags parmi la liste blanche suivante (TagID):',
        allowlist.join(', '),
        'Contraintes:',
        `- max ${parsed.constraints.maxTags} tags pertinents (0..${parsed.constraints.maxTags})`,
        '- Chaque tag: { id, score ∈ [0,1] }',
        '- Pas de texte hors JSON.',
      ].join('\n');

      const user = {
        destinationCountry: parsed.destinationCountry,
        marketplaceCountry: parsed.marketplaceCountry ?? parsed.destinationCountry,
        groupAge: parsed.groupAge,
        season: parsed.season ?? 'any',
        tripType: parsed.tripType ?? 'general',
        maxTags: parsed.constraints.maxTags,
        promptVersion: parsed.constraints.promptVersion,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              {
                role: 'user',
                content: [
                  'Retourne un JSON: { "tags": [ { "id": TagID, "score": number } ], "meta": { "promptVersion": string } }.',
                  'Voici la requête normalisée:',
                  JSON.stringify(user),
                ].join('\n'),
              },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`openai_http_${resp.status}`);
        const data = (await resp.json()) as any;
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('openai_no_content');
        let parsedJson: any;
        try {
          parsedJson = JSON.parse(content);
        } catch {
          parsedJson = content;
        }
        const validated = ExplainResponseSchema.parse(parsedJson);
        const allow = new Set(allowlist);
        const unique: Record<string, number> = {};
        for (const t of validated.tags || []) {
          if (!allow.has(t.id as any)) continue;
          if (unique[t.id] === undefined || t.score > unique[t.id]) unique[t.id] = t.score;
        }
        const compact = Object.entries(unique)
          .map(([id, score]) => ({ id, score }))
          .sort((a, b) => (b.score as number) - (a.score as number))
          .slice(0, parsed.constraints.maxTags);
        response = {
          tags: compact as any,
          meta: { promptVersion: parsed.constraints.promptVersion },
        };
      } catch {
        clearTimeout(timer);
        response = { tags: [], meta: { promptVersion: parsed.constraints.promptVersion } };
      }
    } catch {
      response = { tags: [], meta: { promptVersion: parsed.constraints.promptVersion } };
    }
  }

  inMemoryCache.set(key, { value: response, expiresAt: now + getTtlMs() });
  return ExplainResponseSchema.parse(response);
}
