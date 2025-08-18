import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function tldForMarketplace(country: string): string {
  switch (country) {
    case 'FR':
      return 'fr';
    case 'DE':
      return 'de';
    case 'ES':
      return 'es';
    case 'IT':
      return 'it';
    case 'GB':
      return 'co.uk';
    case 'US':
      return 'com';
    default:
      return 'fr';
  }
}

export async function GET(req: NextRequest, { params }: { params: { asin: string } }) {
  const asin = params.asin;
  const marketplace = (req.nextUrl.searchParams.get('marketplace') ?? 'FR').toUpperCase();
  const subtag = req.nextUrl.searchParams.get('sub') ?? undefined;

  const tag = process.env.AMAZON_AFFILIATE_TAG ?? 'TAG';
  const tld = tldForMarketplace(marketplace);

  const url = new URL(`https://www.amazon.${tld}/dp/${asin}`);
  url.searchParams.set('tag', tag);
  if (subtag) url.searchParams.set('ascsubtag', subtag);

  return NextResponse.redirect(url.toString(), 302);
}
