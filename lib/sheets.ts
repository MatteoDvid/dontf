import { google } from 'googleapis';
import { ProductRecordSchema, type ProductRecord } from './schemas';
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
  const range = process.env.GOOGLE_SHEETS_PRODUCTS_RANGE || 'DF!A:Z';
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
      'DF!A:Z',
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
    tokens: ['_tokens', 'tokens', '_token', 'token'],
    countryCodes: ['countrycodes', 'pays', 'pays cibles', 'countries', 'country'],
  };
  function normalizeCountryNameToIso2(input: string | undefined): string | null {
    const v = String(input || '').trim().toLowerCase();
    if (!v) return null;
    const map: Record<string, string> = {
      // français
      'france': 'FR', 'bresil': 'BR', 'brésil': 'BR', 'maroc': 'MA', 'etats-unis': 'US', 'etats unis': 'US', 'thailande': 'TH', 'thaïlande': 'TH', 'islande': 'IS',
      // anglais (quelques variantes)
      'brazil': 'BR', 'morocco': 'MA', 'states': 'US', 'united states': 'US', 'usa': 'US', 'thailand': 'TH', 'fr': 'FR', 'br': 'BR', 'us': 'US', 'ma': 'MA', 'th': 'TH',
    };
    // retirer accents
    const noAcc = v.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
    const key = noAcc.replace(/\s+/g, ' ');
    const iso = map[key] || map[key.toLowerCase()];
    if (iso) return iso;
    // heuristique: codes déjà ISO2
    if (/^[a-z]{2}$/i.test(v)) return v.toUpperCase();
    return null;
  }

  function parseCountries(input: string | undefined): string[] {
    const raw = String(input || '').trim();
    if (!raw) return [];
    const parts = raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const iso = parts.map((p) => normalizeCountryNameToIso2(p)).filter(Boolean) as string[];
    return Array.from(new Set(iso));
  }

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
  function normalizeToken(input: string): string | null {
    const t = String(input || '').trim().toLowerCase();
    if (!t) return null;
    // enlever quotes simples/doubles autour
    const unquoted = t.replace(/^['"]|['"]$/g, '').trim();
    // bannir tokens trop longs ou uniquement non-alphanum
    if (unquoted.length > 64) return null;
    const cleaned = unquoted
      .replace(/[\u0300-\u036f]/g, '') // diacritiques
      .replace(/\s+/g, ' ');
    if (!/[a-z0-9]/.test(cleaned)) return null;
    return cleaned;
  }

  function parseCommaSeparated(input: string | undefined): string[] {
    const raw = String(input || '').trim();
    if (!raw) return [];
    const parts = raw.split(',').map((s) => normalizeToken(s)).filter(Boolean) as string[];
    return Array.from(new Set(parts));
  }

  function parsePythonSet(input: string | undefined): string[] {
    const raw = String(input || '').trim();
    if (!raw) return [];
    // Exemple: {'t', 'coton', 'respirant'}
    const inside = raw.startsWith('{') && raw.endsWith('}') ? raw.slice(1, -1) : raw;
    const candidates: string[] = [];
    // extraire les séquences entre quotes
    const regex = /['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(inside)) !== null) {
      candidates.push(m[1]);
    }
    if (candidates.length === 0) {
      // fallback: split virgule
      candidates.push(...inside.split(','));
    }
    const tokens = candidates.map((s) => normalizeToken(s)).filter(Boolean) as string[];
    return Array.from(new Set(tokens));
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
    const freeformTags = parseCommaSeparated(r[idx('tags')]);
    const tokenColIdx = idx('tokens');
    const tokenSet = tokenColIdx >= 0 ? parsePythonSet(r[tokenColIdx]) : [];
    const tags = Array.from(new Set([...freeformTags, ...tokenSet])).slice(0, 20);

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
      countryCodes: parseCountries(r[idx('countryCodes')]),
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
  // Déduplication par ASIN: garder le meilleur (mustHave puis priority minimale)
  const uniqByAsin = new Map<string, ProductRecord>();
  for (const p of products) {
    const existing = uniqByAsin.get(p.asin);
    if (!existing) {
      uniqByAsin.set(p.asin, p);
      continue;
    }
    const better = (a: ProductRecord, b: ProductRecord) => {
      if (a.mustHave !== b.mustHave) return a.mustHave ? a : b;
      if (a.priority !== b.priority) return a.priority < b.priority ? a : b;
      return a; // garder le premier sinon
    };
    uniqByAsin.set(p.asin, better(existing, p));
  }
  const deduped = Array.from(uniqByAsin.values());
  // write cache
  try {
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(deduped, null, 2), 'utf-8');
  } catch {}

  return deduped;
}
