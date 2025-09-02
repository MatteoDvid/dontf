import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { readProductsFromCacheOrSheet } from '@/lib/sheets';
import { getTagsForWizardSummary } from '@/lib/ai';
import { PROMPT_VERSION } from '@/lib/tags';
import {
  WizardStateSchema,
  ProductRecordSchema,
  ProductResponseSchema,
  type ProductRecord,
} from '@/lib/schemas';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = WizardStateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Validation error', issues: parsed.error.format() },
        { status: 400 },
      );
    }

    const wizard = parsed.data;
    const marketplace = (wizard.marketplaceCountry ?? wizard.destinationCountry).toUpperCase();

    const validatedProducts = await readProductsFromCacheOrSheet();

    const groupMinAge = Math.min(...wizard.ages);
    const groupMaxAge = Math.max(...wizard.ages);

    function computeSeason(
      countryIso2: string,
      isoDate?: string,
    ): 'winter' | 'spring' | 'summer' | 'autumn' {
      const d = isoDate ? new Date(isoDate) : new Date();
      const month = d.getUTCMonth() + 1;
      const south = new Set(['AU', 'NZ', 'ZA', 'AR', 'CL', 'UY', 'PY', 'BO', 'PE', 'BR']);
      const isSouth = south.has((countryIso2 || '').toUpperCase());
      let season: 'winter' | 'spring' | 'summer' | 'autumn';
      if ([12, 1, 2].includes(month)) season = 'winter';
      else if ([3, 4, 5].includes(month)) season = 'spring';
      else if ([6, 7, 8].includes(month)) season = 'summer';
      else season = 'autumn';
      if (isSouth) {
        if (season === 'winter') season = 'summer';
        else if (season === 'summer') season = 'winter';
        else if (season === 'spring') season = 'autumn';
        else season = 'spring';
      }
      return season;
    }

    const tripSeason = computeSeason(
      wizard.destinationCountry,
      (wizard as any).dates?.start as string | undefined,
    );

    function isClearlyWinterItem(p: ProductRecord): boolean {
      const label = String((p as any).label || '').toLowerCase();
      const productTags: string[] = Array.isArray((p as any).tags)
        ? ((p as any).tags as string[])
        : [];
      const tagsLower = new Set(productTags.map((t) => String(t).toLowerCase()));
      const winterKeywords = [
        'doudoune',
        'anorak',
        'parka',
        'down jacket',
        'puffer',
        'hiver',
        'cold-weather',
        'thermique',
        'thermal',
        'clothing_thermal_layer',
        'polaire',
        'fleece',
        'bonnet',
        'beanie',
        'cache-cou',
        'tour de cou',
        'neck warmer',
        'laine',
        'wool',
        'balaclava',
        'gants',
        'gloves',
        'echarpe',
        'scarf',
      ];
      for (const k of winterKeywords) {
        if (label.includes(k)) return true;
        if (tagsLower.has(k)) return true;
      }
      return false;
    }

    // Déduire la liste blanche dynamique de tags (TagId) depuis le Sheet + fréquences
    const tagCounts: Record<string, number> = {};
    for (const p of validatedProducts) {
      const tags: string[] = Array.isArray((p as any).tags) ? ((p as any).tags as string[]) : [];
      const unique = Array.from(new Set(tags));
      for (const t of unique) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
    const allowedTagIds: string[] = Object.keys(tagCounts);
    const tagsByFreqDesc: string[] = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    // Auto-génération de tags via IA si aucun tag explicite n'est fourni
    let aiActive = String(process.env.AI_ENABLED ?? 'false').toLowerCase() === 'true';
    let effectiveTags: string[] = Array.isArray(wizard.tags) ? (wizard.tags as any) : [];
    let aiSource: 'openai' | 'fallback' | 'disabled' | 'error' | 'manual' | 'none' = 'none';
    let aiReason: string | undefined;
    let excludedTagsFromAi = new Set<string>();
    if (effectiveTags.length > 0) {
      aiSource = 'manual';
    }
    if (aiActive && effectiveTags.length === 0) {
      try {
        const maxTags = Number(process.env.AI_MAX_TAGS ?? '100');
        // Scope allowlist aux tags des produits destination (+ universels)
        const destScopedAllow: string[] = Array.from(new Set(
          validatedProducts
            .filter((p: any) => {
              const cc: string[] = Array.isArray(p.countryCodes) ? (p.countryCodes as string[]) : [];
              return cc.length === 0 || cc.includes(wizard.destinationCountry.toUpperCase());
            })
            .flatMap((p: any) => (Array.isArray(p.tags) ? (p.tags as string[]) : []))
        ));
        const explain = await getTagsForWizardSummary({
          destinationCountry: wizard.destinationCountry,
          marketplaceCountry: wizard.marketplaceCountry ?? wizard.destinationCountry,
          groupAge: { min: groupMinAge, max: groupMaxAge },
          dates: { start: (wizard as any).dates?.start, end: (wizard as any).dates?.end },
          season: tripSeason,
          constraints: { maxTags: Math.max(1, Math.min(400, maxTags)), promptVersion: PROMPT_VERSION },
        } as any, {
          allowedTags: destScopedAllow.length > 0 ? destScopedAllow : (allowedTagIds.length > 0 ? allowedTagIds : undefined),
        });
        excludedTagsFromAi = new Set<string>((explain as any).exclude?.map((e: any) => e.id) || []);
        effectiveTags = (explain.tags || [])
          .map((t) => t.id)
          .filter((id) => !excludedTagsFromAi.has(id)) as any;
        aiSource = (explain.meta as any)?.source || 'openai';
        aiReason = (explain.meta as any)?.reason;
      } catch (e) {
        // En cas d'échec IA, on bascule en mode non-strict (ne filtre pas par tags)
        aiActive = false;
        effectiveTags = [];
        aiSource = 'error';
        aiReason = 'OPENAI_REQUEST_FAILED_OR_EXCEPTION';
      }
      // Si IA n'a rien retourné, on ne bloque pas la recommandation
      if (effectiveTags.length === 0) {
        aiActive = false;
      }
    }

    // Fallback: si aucun tag n'est disponible (IA désactivée ou sans résultat),
    // appliquer des tags saisonniers génériques pour éviter de tout retourner
    if (effectiveTags.length === 0) {
      const maxTags = Number(process.env.AI_MAX_TAGS ?? '100');
      // Fallback dynamique: prendre les tags les plus fréquents issus du Sheet
      const fallback = tagsByFreqDesc.slice(0, Math.max(1, Math.min(400, maxTags)));
      if (fallback.length > 0) {
        effectiveTags = fallback as any;
        if (aiSource === 'none' || aiSource === 'error' || aiSource === 'openai') {
          aiSource = 'fallback';
          if (!aiReason) {
            aiReason = aiActive ? 'EFFECTIVE_TAGS_EMPTY' : 'AI_DISABLED_OR_NO_TAGS';
          }
        }
      }
    }

    const filtered: ProductRecord[] = validatedProducts
      .filter((p) => p.status === 'active')
      .filter((p) => {
        // Exclure les articles d'hiver si la saison estimée à destination est l'été
        if (tripSeason === 'summer') {
          return !isClearlyWinterItem(p);
        }
        return true;
      })
      .filter((p) => {
        // Si l'IA renvoie des tags à exclure, éliminer tout produit qui les possède
        if (excludedTagsFromAi.size === 0) return true;
        const productTags: string[] = Array.isArray((p as any).tags)
          ? ((p as any).tags as string[])
          : [];
        for (const t of productTags) {
          if (excludedTagsFromAi.has(String(t))) return false;
        }
        return true;
      })
      .filter((p) => {
        // Si des pays sont spécifiés sur le produit, filtrer par destination
        const cc = Array.isArray((p as any).countryCodes) ? ((p as any).countryCodes as string[]) : [];
        if (cc.length === 0) return true; // pas de restriction
        return cc.includes(wizard.destinationCountry.toUpperCase());
      })
      .filter((p) => groupMaxAge >= p.ageMin && groupMinAge <= p.ageMax) // intersection non vide
      .filter((p) => {
        const hasChild = wizard.ages.some((a) => a < 18);
        const hasAdult = wizard.ages.some((a) => a >= 18);
        if (p.audience === 'all') return true;
        if (p.audience === 'child') return hasChild;
        if (p.audience === 'adult') return hasAdult;
        return true;
      })
      .filter((p) => {
        // Optional tag intersection if tags provided (après éventuelle génération IA)
        const reqTags = effectiveTags;
        if (reqTags.length === 0) {
          // Si pas de tags effectifs, et IA active strict → rien
          if (aiActive) return false;
          // Sinon on autorise (mode générique)
          return true;
        }
        const productTags: string[] = Array.isArray((p as any).tags)
          ? ((p as any).tags as string[])
          : [];
        return productTags.some((t) => reqTags.includes(t as any));
      });

    const sorted = filtered.sort((a, b) => {
      if (a.mustHave !== b.mustHave) return a.mustHave ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.asin.localeCompare(b.asin); // tie-breaker stable
    });

    const seen = new Set<string>();
    const response = sorted.filter((p) => {
      // Déduplication d'affichage: éviter doublons par asin ou par label
      const key = `${p.asin}::${p.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((p) => {
      const explain: string[] = [];
      explain.push(`destination=${wizard.destinationCountry}`);
      explain.push(`marketplace=${marketplace}`);
      explain.push(`ageRange=${groupMinAge}-${groupMaxAge}`);
      if (p.mustHave) explain.push('mustHave=true');
      explain.push(`priority=${p.priority}`);
      return {
        label: p.label,
        asin: p.asin,
        marketplace,
        explain: [...explain, `ai=${aiSource}`, ...(aiReason ? [`aiReason=${aiReason}`] : [])],
      };
    });

    const validatedResponse = ProductResponseSchema.array().parse(response);

    return NextResponse.json(validatedResponse, { status: 200 });
  } catch (err) {
    console.error('[api/recommend] Internal error', err);
    const detail = err instanceof Error ? { name: err.name, message: err.message } : { err };
    return NextResponse.json({ message: 'Server error', detail }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ message: 'Use POST with wizardState' }, { status: 405 });
}
