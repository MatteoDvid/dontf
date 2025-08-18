import { NextResponse } from 'next/server';
import { ExplainRequestSchema, ExplainResponseSchema } from '@/lib/schemas';
import { getTagsForWizardSummary } from '@/lib/ai';

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
    const result = await getTagsForWizardSummary(parsed.data);
    const validated = ExplainResponseSchema.parse(result);
    return NextResponse.json(validated, { status: 200 });
  } catch (err) {
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ message: 'Use POST' }, { status: 405 });
}
