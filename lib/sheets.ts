import { google } from 'googleapis';
import { ProductRecordSchema, type ProductRecord } from './schemas';
import type { TagId } from './tags';
import { promises as fs } from 'fs';
import path from 'path';

type SheetsConfig = {
  spreadsheetId: string;
  range: string;
  serviceEmail: string;
  serviceKey: string;
};

function getConfig(): SheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_PRODUCTS_RANGE || 'Products!A:Z';
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const serviceKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
  if (!spreadsheetId || !serviceEmail || !serviceKey) return null;
  return { spreadsheetId, range, serviceEmail, serviceKey };
}

function getCachePath() {
  return path.join(process.cwd(), 'data', 'products-cache.json');
}

function getCacheTtlMs(): number {
  const hours = Number(process.env.CACHE_TTL_HOURS || '12');
  return Math.max(1, hours) * 60 * 60 * 1000;
}

export async function readProductsFromCacheOrSheet(): Promise<ProductRecord[]> {
  const disabled = String(process.env.SHEETS_DISABLED ?? 'true').toLowerCase() === 'true';
  const cachePath = getCachePath();

  // 1) Try cache
  try {
    const stat = await fs.stat(cachePath);
    const age = Date.now() - stat.mtimeMs;
    if (age < getCacheTtlMs()) {
      const raw = await fs.readFile(cachePath, 'utf-8');
      const json = JSON.parse(raw);
      return ProductRecordSchema.array().parse(json);
    }
  } catch {}

  // 2) If disabled → fall back to mock
  if (disabled) {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', 'products.mock.json'), 'utf-8');
    const json = JSON.parse(raw);
    return ProductRecordSchema.array().parse(json);
  }

  // 3) Read from Google Sheets
  const cfg = getConfig();
  const scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : path.join(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : undefined;

  if (!cfg && !keyFile) {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', 'products.mock.json'), 'utf-8');
    const json = JSON.parse(raw);
    return ProductRecordSchema.array().parse(json);
  }

  let auth: any;
  if (keyFile) {
    const googleAuth = new google.auth.GoogleAuth({ keyFile, scopes });
    auth = await googleAuth.getClient();
  } else if (cfg) {
    auth = new google.auth.JWT({
      email: cfg.serviceEmail,
      key: cfg.serviceKey.replace(/\\n/g, '\n'),
      scopes,
    });
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId:
      (cfg?.spreadsheetId as string) || (process.env.GOOGLE_SHEETS_SPREADSHEET_ID as string),
    range:
      (cfg?.range as string) ||
      (process.env.GOOGLE_SHEETS_PRODUCTS_RANGE as string) ||
      'Products!A:Z',
  });
  const values = res.data.values || [];
  if (values.length === 0) return [];

  const [header, ...rows] = values as string[][];
  const idx = (name: string) => header.indexOf(name);
  const synonymToTag: Record<string, TagId> = {
    // gear
    backpack: 'GEAR_BACKPACK_DAYPACK',
    sac: 'GEAR_BACKPACK_DAYPACK',
    'sac a dos': 'GEAR_BACKPACK_DAYPACK',
    adapter: 'GEAR_UNIVERSAL_ADAPTER',
    adaptateur: 'GEAR_UNIVERSAL_ADAPTER',
    power: 'GEAR_UNIVERSAL_ADAPTER',
    powerbank: 'GEAR_POWER_BANK',
    'batterie externe': 'GEAR_POWER_BANK',
    bottle: 'GEAR_TRAVEL_BOTTLES',
    flacon: 'GEAR_TRAVEL_BOTTLES',
    gourde: 'GEAR_TRAVEL_BOTTLES',
    poncho: 'GEAR_RAIN_PONCHO',
    rain: 'GEAR_RAIN_PONCHO',
    // clothing
    thermal: 'CLOTHING_THERMAL_LAYER',
    thermals: 'CLOTHING_THERMAL_LAYER',
    'base-layer': 'CLOTHING_THERMAL_LAYER',
    'cold-weather': 'CLOTHING_THERMAL_LAYER',
    // essentials
    'document pouch': 'ESSENTIALS_DOCUMENT_POUCH',
    'pochette documents': 'ESSENTIALS_DOCUMENT_POUCH',
    // risk-safety
    'insect-repellent': 'RISK_MOSQUITO_REPELLENT',
    moustique: 'RISK_MOSQUITO_REPELLENT',
  };

  function mapToTagIds(freeform: string[]): TagId[] {
    const out: TagId[] = [];
    for (const raw of freeform) {
      const key = raw.toLowerCase();
      const mapped = synonymToTag[key as keyof typeof synonymToTag];
      if (mapped && !out.includes(mapped)) out.push(mapped);
    }
    return out.slice(0, 6);
  }
  const mapRow = (r: string[]): ProductRecord => {
    const freeformTags = (r[idx('tags')] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = mapToTagIds(freeformTags);
    return ProductRecordSchema.parse({
      label: r[idx('label')] || '',
      asin: r[idx('asin')] || '',
      status: (r[idx('status')] || 'active') as any,
      mustHave: (r[idx('mustHave')] || 'false').toLowerCase() === 'true',
      priority: Number.isFinite(Number(r[idx('priority')])) ? Number(r[idx('priority')]) : 0,
      audience: ((r[idx('audience')] || 'all') as any) || 'all',
      ageMin: Number(r[idx('ageMin')] || '0'),
      ageMax: Number(r[idx('ageMax')] || '120'),
      tags: tags as any,
    });
  };

  const products = rows.map(mapRow);
  // write cache
  try {
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(products, null, 2), 'utf-8');
  } catch {}

  return products;
}
