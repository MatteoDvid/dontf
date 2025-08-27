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
  function normalizeHeaderKey(input: string): string {
    return String(input || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function normalizeHeaderKeyTight(input: string): string {
    return normalizeHeaderKey(input).replace(/\s+/g, '');
  }

  const HEADER_SYNONYMS: Record<string, string[]> = {
    label: ['label', 'nom', 'name', 'libelle'],
    asin: ['asin', 'sku'],
    status: ['status', 'statut'],
    mustHave: ['musthave', 'must have', 'must_have'],
    priority: ['priority', 'priorite', 'priorite\u0301', 'priorite\u0300'],
    audience: ['audience', 'public', 'cible', 'genre', 'mixte'],
    ageMin: ['agemin', 'age min', 'age_min', 'age-min'],
    ageMax: ['agemax', 'age max', 'age_max', 'age-max'],
    tags: ['tags', 'mots cles', 'mots-cles', 'mots_cles', 'keywords'],
    countryCodes: ['countrycodes', 'pays', 'pays cibles', 'countries', 'country'],
  };

  function buildHeaderIndex(h: string[]): Record<string, number> {
    const indexByCanonical: Record<string, number> = {};
    const normalizedToIndex: Record<string, number> = {};
    h.forEach((cell, i) => {
      normalizedToIndex[normalizeHeaderKeyTight(cell)] = i;
    });
    for (const canonical of Object.keys(HEADER_SYNONYMS)) {
      const candidates = HEADER_SYNONYMS[canonical];
      for (const c of candidates) {
        const idx = normalizedToIndex[normalizeHeaderKeyTight(c)];
        if (typeof idx === 'number') {
          indexByCanonical[canonical] = idx;
          break;
        }
      }
    }
    return indexByCanonical;
  }

  const headerIndex = buildHeaderIndex(header);
  const idx = (name: string) =>
    typeof headerIndex[name] === 'number' ? (headerIndex as any)[name] : header.indexOf(name);
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
  function normalizeBoolean(input: string | undefined): boolean {
    const v = String(input || '').trim().toLowerCase();
    if (['true', 'vrai', 'oui', '1', 'yes', 'y'].includes(v)) return true;
    if (['false', 'faux', 'non', '0', 'no', 'n'].includes(v)) return false;
    return false;
  }

  function normalizeStatus(input: string | undefined): 'active' | 'inactive' {
    const v = String(input || '').trim().toLowerCase();
    if (['active', 'actif', 'ok', 'on', 'true', 'vrai', 'oui', '1'].includes(v)) return 'active';
    if (['inactive', 'inactif', 'off', 'false', 'faux', 'non', '0'].includes(v)) return 'inactive';
    if (['candidate', 'candidat'].includes(v)) return 'active';
    return 'active';
  }

  function normalizeAudience(input: string | undefined): 'child' | 'adult' | 'all' {
    const v = String(input || '').trim().toLowerCase();
    if (['child', 'enfant', 'kid', 'kids'].includes(v)) return 'child';
    if (['adult', 'adulte', 'homme', 'femme', 'men', 'women'].includes(v)) return 'adult';
    if (['all', 'mixte', 'tous', 'unspecified', ''].includes(v)) return 'all';
    return 'all';
  }

  function toInt(input: string | undefined, fallback: number): number {
    const n = Number(String(input || '').trim());
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  const mapRow = (r: string[], rowIndex: number): ProductRecord | null => {
    const freeformTags = (r[idx('tags')] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const tags = mapToTagIds(freeformTags);

    const candidate = {
      label: (r[idx('label')] || r[idx('Nom' as any)] || '').toString().trim(),
      asin: (r[idx('asin')] || '').toString().trim(),
      status: normalizeStatus(r[idx('status')]),
      mustHave: normalizeBoolean(r[idx('mustHave')]),
      priority: toInt(r[idx('priority')], 0),
      audience: normalizeAudience(r[idx('audience')]),
      ageMin: toInt(r[idx('ageMin')] ?? r[idx('age min' as any)], 0),
      ageMax: toInt(r[idx('ageMax')] ?? r[idx('age max' as any)], 120),
      tags: tags as any,
    };

    const parsed = ProductRecordSchema.safeParse(candidate);
    if (!parsed.success) {
      console.warn('[sheets] Ligne ignorée (invalide)', {
        row: rowIndex + 2,
        issues: parsed.error.issues,
      });
      return null;
    }
    return parsed.data;
  };

  const products = rows
    .map((r, i) => mapRow(r, i))
    .filter((p): p is ProductRecord => p !== null);
  // write cache
  try {
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(products, null, 2), 'utf-8');
  } catch {}

  return products;
}
