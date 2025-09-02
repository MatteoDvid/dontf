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
  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || '100000');

  // Minimal fallback V1: return empty tags when AI disabled or no key
  let response: ExplainResponse = {
    tags: [],
    meta: { promptVersion: parsed.constraints.promptVersion, source: 'disabled', reason: 'AI_DISABLED_OR_NO_KEY' },
  };

  if (aiEnabled && apiKey) {
    try {
      const allowlist = Array.isArray(options?.allowedTags) && options!.allowedTags!.length > 0
        ? (options!.allowedTags as string[])
        : ALL_TAGS;
      const nordic = new Set(['IS', 'NO', 'SE', 'FI']);
      const isNordicSummer = nordic.has(parsed.destinationCountry) && (parsed.season || '').toLowerCase() === 'summer';
      const isBrazilSummer = parsed.destinationCountry === 'BR' && (parsed.season || '').toLowerCase() === 'summer';
      const isMoroccoSummer = parsed.destinationCountry === 'MA' && (parsed.season || '').toLowerCase() === 'summer';
      const system = [
        'Tu es un assistant de tagging de voyage. Réponds en JSON strict uniquement.',
        'Ne propose que des tags parmi la liste blanche suivante (TagID):',
        allowlist.join(', '),
        'Contraintes:',
        `- max ${parsed.constraints.maxTags} tags pertinents (0..${parsed.constraints.maxTags})`,
        '- Chaque tag: { id, score ∈ [0,1] }',
        '- Propose aussi une liste "exclude" de tags à écarter si non pertinents (toujours issus de la allowlist).',
        '- Si la allowlist contient "core-kit", inclure "core-kit" (score élevé).',
        ...(isNordicSummer ? [
          'Règle spéciale été nordique (IS/NO/SE/FI + season=summer):',
          '- Exclure UNIQUEMENT: doudoune, parka, puffer, ski, base-layer thermique épais',
          '- NE PAS exclure: polaire léger, bonnet fin, coupe-vent, pluie, waterproof',
          '- Favoriser: core-kit, rain, waterproof, randonnée/trek, chaussures antidérapantes/cramponnables, sacs',
        ] : []),
        ...(isBrazilSummer ? [
          'Règle spéciale Brésil été (BR + season=summer):',
          '- Favoriser fortement: core-kit, randonnée/trek, chaussures, waterproof/pluie, anti-moustique',
          '- Éviter les items hiver (thermal, doudoune, parka)',
        ] : []),
        ...(isMoroccoSummer ? [
          'Règle spéciale Maroc été (MA + season=summer):',
          '- Favoriser: core-kit, chaussures de rando/trek, sac à dos, bouteilles/gourde, waterproof/pluie, adaptateur universel, power bank',
          '- Ne pas se limiter à solaire/baume uniquement',
          '- Éviter les items hiver lourds (doudoune/parka)',
        ] : []),
        '- Pas de texte hors JSON.',
      ].join('\n');

      const user = {
        destinationCountry: parsed.destinationCountry,
        marketplaceCountry: parsed.marketplaceCountry ?? parsed.destinationCountry,
        groupAge: parsed.groupAge,
        dates: parsed.dates,
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
                  'Retourne un JSON: { "tags": [ { "id": TagID, "score": number } ], "exclude": [ { "id": TagID, "score"?: number } ], "meta": { "promptVersion": string } }.',
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
        const rawCount = Array.isArray(validated.tags) ? validated.tags.length : 0;
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
        let reason: string | undefined = undefined;
        if (rawCount === 0) reason = 'OPENAI_RETURNED_EMPTY';
        else if (compact.length === 0) reason = 'NO_ALLOWED_TAGS_MATCH';
        response = {
          tags: compact as any,
          exclude: Array.isArray(validated.exclude)
            ? (validated.exclude as any[]).filter((e) => allow.has(e.id)).slice(0, parsed.constraints.maxTags)
            : [],
          meta: { promptVersion: parsed.constraints.promptVersion, source: 'openai', ...(reason ? { reason } : {}) },
        } as any;
      } catch (err: any) {
        clearTimeout(timer);
        let reason = 'OPENAI_REQUEST_FAILED';
        const msg = (err && (err.message || String(err))) as string;
        if (err && (err.name === 'AbortError' || /aborted/i.test(String(err)))) {
          reason = 'OPENAI_TIMEOUT';
        } else if (typeof msg === 'string' && /^openai_http_\d+/.test(msg)) {
          reason = msg.toUpperCase();
        }
        try {
          console.error('[ai] OpenAI error:', msg);
        } catch {}
        response = { tags: [], meta: { promptVersion: parsed.constraints.promptVersion, source: 'error', reason } };
      }
    } catch (outerErr: any) {
      try {
        console.error('[ai] OpenAI outer error:', outerErr?.message || String(outerErr));
      } catch {}
      response = { tags: [], meta: { promptVersion: parsed.constraints.promptVersion, source: 'error', reason: 'OPENAI_UNEXPECTED_ERROR' } };
    }
  }

  // If still empty tags → fallback to allowlist-derived tags to ensure filtering works
  if (!response.tags || response.tags.length === 0) {
    const allowlist = Array.isArray(options?.allowedTags) && options!.allowedTags!.length > 0
      ? (options!.allowedTags as string[])
      : ALL_TAGS;
    const chosenSource = allowlist.slice(0, parsed.constraints.maxTags);
    // Préférer core-kit si disponible
    const withCore = new Set<string>(chosenSource);
    withCore.add('core-kit');
    const chosen = Array.from(withCore).slice(0, parsed.constraints.maxTags).map((id) => ({ id, score: id === 'core-kit' ? 0.9 as number : 0.5 as number })) as any;
    response = {
      tags: chosen as any,
      meta: { promptVersion: parsed.constraints.promptVersion, source: 'fallback', reason: response.meta?.reason },
    };
  }

  // Enforce presence of core-kit globally si autorisé
  try {
    const allowForCore = Array.isArray(options?.allowedTags) && options!.allowedTags!.length > 0
      ? (options!.allowedTags as string[])
      : ALL_TAGS;
    if (allowForCore.includes('core-kit')) {
      const already = Array.isArray(response.tags) && response.tags.some((t: any) => t.id === 'core-kit');
      if (!already) {
        const max = parsed.constraints.maxTags;
        const next = Array.isArray(response.tags) ? (response.tags as any[]).slice() : [];
        next.unshift({ id: 'core-kit', score: 0.9 });
        if (next.length > max) next.length = max;
        response = { ...response, tags: next as any } as any;
      }
    }
  } catch {}

  inMemoryCache.set(key, { value: response, expiresAt: now + getTtlMs() });
  return ExplainResponseSchema.parse(response);
}
