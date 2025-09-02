import { NextResponse } from 'next/server';
import { ExplainRequestSchema, ExplainResponseSchema } from '@/lib/schemas';
import { getTagsForWizardSummary } from '@/lib/ai';
import { readProductsFromCacheOrSheet } from '@/lib/sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ExplainRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Validation error', issues: parsed.error.format() },
        { status: 400 },
      );
    }
    // Build dynamic allowlist from sheet, scoped to destination (+ universels)
    const products = await readProductsFromCacheOrSheet();
    const dest = parsed.data.destinationCountry.toUpperCase();
    const scoped = products.filter((p: any) => {
      const cc: string[] = Array.isArray(p.countryCodes) ? (p.countryCodes as string[]) : [];
      return cc.length === 0 || cc.includes(dest);
    });
    const allowlist: string[] = Array.from(
      new Set(
        scoped.flatMap((p: any) => (Array.isArray(p.tags) ? (p.tags as string[]) : [])),
      ),
    );
    const limitedAllowlist = allowlist.slice(0, 400); // éviter prompts trop longs
    const result = await getTagsForWizardSummary(parsed.data, {
      allowedTags: limitedAllowlist.length > 0 ? limitedAllowlist : undefined,
    });
    const validated = ExplainResponseSchema.parse(result);
    return NextResponse.json(validated, { status: 200 });
  } catch (err) {
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ message: 'Use POST' }, { status: 405 });
}
