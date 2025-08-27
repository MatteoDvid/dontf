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

    // Déduire la liste blanche dynamique de tags (TagId) depuis le Sheet
    const allowedTagIds: string[] = Array.from(
      new Set(
        validatedProducts.flatMap((p) =>
          Array.isArray((p as any).tags) ? ((p as any).tags as string[]) : [],
        ),
      ),
    );

    // Auto-génération de tags via IA si aucun tag explicite n'est fourni
    let aiActive = String(process.env.AI_ENABLED ?? 'false').toLowerCase() === 'true';
    let effectiveTags: string[] = Array.isArray(wizard.tags) ? (wizard.tags as any) : [];
    if (aiActive && effectiveTags.length === 0) {
      try {
        const maxTags = Number(process.env.AI_MAX_TAGS ?? '6');
        const explain = await getTagsForWizardSummary({
          destinationCountry: wizard.destinationCountry,
          marketplaceCountry: wizard.marketplaceCountry ?? wizard.destinationCountry,
          groupAge: { min: groupMinAge, max: groupMaxAge },
          constraints: { maxTags: Math.max(1, Math.min(6, maxTags)), promptVersion: PROMPT_VERSION },
        } as any, {
          allowedTags: allowedTagIds.length > 0 ? allowedTagIds : undefined,
        });
        effectiveTags = (explain.tags || []).map((t) => t.id) as any;
      } catch (e) {
        // En cas d'échec IA, on bascule en mode non-strict (ne filtre pas par tags)
        aiActive = false;
        effectiveTags = [];
      }
      // Si IA n'a rien retourné, on ne bloque pas la recommandation
      if (effectiveTags.length === 0) {
        aiActive = false;
      }
    }

    const filtered: ProductRecord[] = validatedProducts
      .filter((p) => p.status === 'active')
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

    const response = sorted.map((p) => {
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
        explain,
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
