'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PROMPT_VERSION } from '@/lib/tags';

type ProductItem = { label: string; asin: string; marketplace: string; explain: string[] };
type ApiResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; items: Array<ProductItem> }
  | { status: 'empty' }
  | { status: 'validation-error'; issues: unknown }
  | { status: 'network-error' };

type TagItem = { id: string; score: number };
type AiMeta = { promptVersion: string; source?: 'openai' | 'fallback' | 'disabled' | 'error'; reason?: string };
type AiResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; tags: TagItem[]; meta?: AiMeta }
  | { status: 'network-error' };

export default function WizardPage() {
  const [destinationCountry, setDestinationCountry] = useState('FR');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [travelers, setTravelers] = useState(1);
  const [agesText, setAgesText] = useState('30');
  const [agesInputs, setAgesInputs] = useState<string[]>(['30']);
  const [result, setResult] = useState<ApiResult>({ status: 'idle' });
  const [ai, setAi] = useState<AiResult>({ status: 'idle' });
  const [showAll, setShowAll] = useState(false);
  const [isDatePopupOpen, setIsDatePopupOpen] = useState(false);
  const [tmpStart, setTmpStart] = useState('');
  const [tmpEnd, setTmpEnd] = useState('');
  const [numAdults, setNumAdults] = useState(1);
  const [numChildren, setNumChildren] = useState(0);
  const [childDefaultAge, setChildDefaultAge] = useState(10);

  function extractPriority(explain: string[]): number {
    try {
      const token = (explain || []).find((s) => s.startsWith('priority='));
      if (!token) return Number.POSITIVE_INFINITY;
      const v = Number(token.split('=')[1]);
      return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  function colorForDisplayPriority(dp: number): string {
    if (dp === 1) return 'bg-red-500';
    if (dp === 2) return 'bg-orange-400';
    return 'bg-yellow-300 text-gray-900';
  }

  function computeSeason(countryIso2: string, isoDate?: string): 'winter' | 'spring' | 'summer' | 'autumn' {
    const d = isoDate ? new Date(isoDate) : new Date();
    const month = d.getUTCMonth() + 1; // 1..12
    const south = new Set(['AU', 'NZ', 'ZA', 'AR', 'CL', 'UY', 'PY', 'BO', 'PE', 'BR']);
    const isSouth = south.has((countryIso2 || '').toUpperCase());
    // Northern hemisphere seasons (meteorological)
    let season: 'winter' | 'spring' | 'summer' | 'autumn';
    if ([12, 1, 2].includes(month)) season = 'winter';
    else if ([3, 4, 5].includes(month)) season = 'spring';
    else if ([6, 7, 8].includes(month)) season = 'summer';
    else season = 'autumn';
    if (isSouth) {
      // Invert for southern hemisphere
      if (season === 'winter') season = 'summer';
      else if (season === 'summer') season = 'winter';
      else if (season === 'spring') season = 'autumn';
      else season = 'spring';
    }
    return season;
  }

  const ages = useMemo(
    () =>
      agesInputs
        .map((s) => s.trim())
        .filter(Boolean)
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 120),
    [agesInputs],
  );

  // Garder agesText en phase pour la persistance existante
  useEffect(() => {
    try {
      setAgesText(agesInputs.map((s) => s.trim()).join(','));
    } catch {}
  }, [agesInputs]);

  const onSubmit = useCallback(async () => {
    setResult({ status: 'loading' });
    setAi({ status: 'loading' });
    try {
      // 1) Analyse IA (avec cache session)
      const groupMin = Math.min(...ages);
      const groupMax = Math.max(...ages);
      const season = computeSeason(destinationCountry, dateStart || undefined);
      const explainPayload = {
        destinationCountry: destinationCountry.toUpperCase(),
        marketplaceCountry: 'FR',
        groupAge: { min: groupMin, max: groupMax },
        dates: dateStart && dateEnd ? { start: new Date(dateStart).toISOString(), end: new Date(dateEnd).toISOString() } : undefined,
        season,
        tripType: 'general',
        constraints: { maxTags: 6, promptVersion: PROMPT_VERSION },
      };

      let tagsForRecommend: string[] | undefined = undefined;
      try {
        const cacheKey = `explain:${JSON.stringify(explainPayload)}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const data = JSON.parse(cached) as { tags: TagItem[]; meta?: AiMeta };
          tagsForRecommend = Array.isArray(data.tags) ? data.tags.map((t) => t.id) : undefined;
          setAi({ status: 'success', tags: Array.isArray(data.tags) ? data.tags : [], meta: data.meta });
        } else {
          const resExplain = await fetch('/api/explain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(explainPayload),
          });
          if (resExplain.ok) {
            const data = (await resExplain.json()) as { tags: TagItem[]; meta?: AiMeta };
            const tags = Array.isArray(data.tags) ? data.tags.slice(0, 100) : [];
            sessionStorage.setItem(cacheKey, JSON.stringify({ tags, meta: data.meta }));
            setAi({ status: 'success', tags, meta: data.meta });
            tagsForRecommend = tags.map((t) => t.id);
          } else {
            setAi({ status: 'network-error' });
          }
        }
      } catch {
        setAi({ status: 'network-error' });
      }

      // 2) Recommandations
      const start = dateStart ? new Date(dateStart).toISOString() : new Date().toISOString();
      const end = dateEnd ? new Date(dateEnd).toISOString() : new Date().toISOString();
      const recommendPayload = {
        destinationCountry: destinationCountry.toUpperCase(),
        marketplaceCountry: 'FR',
        dates: { start, end },
        travelers,
        ages,
        tags: tagsForRecommend,
      };

      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recommendPayload),
      });

      if (res.status === 400) {
        const data = await res.json();
        setResult({ status: 'validation-error', issues: data.issues });
        return;
      }

      if (!res.ok) {
        setResult({ status: 'network-error' });
        return;
      }

      const items = (await res.json()) as Array<ProductItem>;
      setShowAll(false);
      if (items.length === 0) setResult({ status: 'empty' });
      else {
        const sorted = items.slice().sort((a, b) => extractPriority(a.explain) - extractPriority(b.explain));
        setResult({ status: 'success', items: sorted });
      }
    } catch {
      setResult({ status: 'network-error' });
    }
  }, [destinationCountry, travelers, ages, dateStart, dateEnd]);

  // Deriver travelers et agesInputs depuis compteurs Adultes/Enfants
  useEffect(() => {
    const total = Math.max(1, Math.min(20, numAdults + numChildren));
    setTravelers(total);
    const adultsAges = Array.from({ length: Math.max(0, Math.min(20, numAdults)) }).map(() => '30');
    const safeChildAge = Math.max(0, Math.min(17, childDefaultAge));
    const childrenAges = Array.from({ length: Math.max(0, Math.min(20, numChildren)) }).map(() => String(safeChildAge));
    const combined = adultsAges.concat(childrenAges).slice(0, 20);
    setAgesInputs(combined.length > 0 ? combined : ['30']);
  }, [numAdults, numChildren, childDefaultAge]);

  // Persist wizardState in localStorage
  useEffect(() => {
    try {
      const state = {
        destinationCountry,
        travelers,
        agesText,
        dateStart,
        dateEnd,
        numAdults,
        numChildren,
        childDefaultAge,
      };
      localStorage.setItem('wizardStateV1', JSON.stringify(state));
    } catch {}
  }, [destinationCountry, travelers, agesText, dateStart, dateEnd, numAdults, numChildren, childDefaultAge]);

  // Load wizardState from localStorage on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('wizardStateV1');
      if (raw) {
        const state = JSON.parse(raw) as Partial<{
          destinationCountry: string;
          travelers: number;
          agesText: string;
          dateStart: string;
          dateEnd: string;
          numAdults: number;
          numChildren: number;
          childDefaultAge: number;
        }>;
        if (state.destinationCountry) setDestinationCountry(state.destinationCountry);
        if (typeof state.numAdults === 'number') setNumAdults(state.numAdults);
        if (typeof state.numChildren === 'number') setNumChildren(state.numChildren);
        if (typeof state.childDefaultAge === 'number') setChildDefaultAge(state.childDefaultAge);
        if (typeof state.travelers === 'number' && (state.numAdults === undefined || state.numChildren === undefined)) setTravelers(state.travelers);
        if (state.agesText) {
          setAgesText(state.agesText);
          const parsed = state.agesText
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          setAgesInputs(parsed.length > 0 ? parsed : ['30']);
          // Dériver les compteurs si non présents
          if (state.numAdults === undefined || state.numChildren === undefined) {
            try {
              const agesNum = parsed.map((s) => Number(s)).filter((n) => Number.isFinite(n));
              const childCount = agesNum.filter((n) => n < 18).length;
              const adultCount = Math.max(0, agesNum.length - childCount);
              setNumAdults(adultCount > 0 ? adultCount : 1);
              setNumChildren(childCount);
            } catch {}
          }
        }
        if (state.dateStart) setDateStart(state.dateStart);
        if (state.dateEnd) setDateEnd(state.dateEnd);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Popup Dates helpers
  function openDatePopup() {
    setTmpStart(dateStart);
    setTmpEnd(dateEnd);
    setIsDatePopupOpen(true);
  }
  function closeDatePopup() {
    setIsDatePopupOpen(false);
  }
  function confirmDatePopup() {
    // Validation: retour ≥ départ
    let s = tmpStart;
    let e = tmpEnd || tmpStart;
    if (s && e && e < s) {
      const t = s;
      s = e;
      e = t;
    }
    setDateStart(s);
    setDateEnd(e);
    setIsDatePopupOpen(false);
  }

  function formatDateLabel(s: string): string {
    try {
      if (!s) return '';
      const [y, m, d] = s.split('-').map((n) => Number(n));
      if (!y || !m || !d) return '';
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    } catch {
      return s;
    }
  }

  // DateRangePicker visuel (deux mois côte à côte)
  function DateRangePicker(props: { start: string; end: string; onChange: (s: string, e: string) => void; }) {
    const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const parse = (s: string) => {
      if (!s) return null as Date | null;
      const [y, m, d] = s.split('-').map((n) => Number(n));
      if (!y || !m || !d) return null;
      return new Date(y, m - 1, d);
    };
    const [view, setView] = useState(() => {
      const base = parse(props.start) || new Date();
      return { year: base.getFullYear(), month: base.getMonth() + 1 };
    });
    const [selStart, setSelStart] = useState<string>(props.start || '');
    const [selEnd, setSelEnd] = useState<string>(props.end || '');

    function buildMonth(y: number, m: number) {
      const first = new Date(y, m - 1, 1);
      const daysInMonth = new Date(y, m, 0).getDate();
      const firstDow = (first.getDay() + 6) % 7; // 0=Mon
      const list: Array<{ key: string } | null> = [];
      for (let i = 0; i < firstDow; i++) list.push(null);
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, m - 1, d);
        list.push({ key: toKey(dt) });
      }
      while (list.length % 7 !== 0) list.push(null);
      return list;
    }

    function isInRange(k: string) {
      if (!selStart || !selEnd) return false;
      return k >= selStart && k <= selEnd;
    }
    function onSelect(k: string) {
      if (!selStart || (selStart && selEnd)) {
        setSelStart(k);
        setSelEnd('');
      } else {
        if (k < selStart) {
          setSelEnd(selStart);
          setSelStart(k);
        } else {
          setSelEnd(k);
        }
      }
    }
    function apply() {
      props.onChange(selStart, selEnd || selStart);
    }
    function shiftMonth(delta: number) {
      const m0 = view.month + delta;
      const y = view.year + Math.floor((m0 - 1) / 12);
      const m = ((m0 - 1) % 12 + 12) % 12 + 1;
      setView({ year: y, month: m });
    }
    const view2 = { year: view.year + (view.month === 12 ? 1 : 0), month: view.month === 12 ? 1 : view.month + 1 };
    const todayKey = toKey(new Date());
    function renderMonth(y: number, m: number) {
      const days = buildMonth(y, m);
      return (
        <div className="p-3 rounded-xl border bg-gray-50">
          <div className="text-center font-medium mb-2">{String(m).padStart(2, '0')}/{y}</div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
            <div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div><div>D</div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((cell, idx) => (
              cell ? (
                <button
                  key={cell.key}
                  onClick={() => onSelect(cell.key)}
                  disabled={cell.key < todayKey}
                  className={`h-9 rounded-md text-sm transition ${
                    cell.key < todayKey
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : isInRange(cell.key)
                      ? 'bg-gray-900 text-white'
                      : selStart === cell.key || selEnd === cell.key
                      ? 'bg-gray-800 text-white'
                      : 'bg-white hover:bg-gray-100 border'
                  }`}
                >
                  {Number(cell.key.split('-')[2])}
                </button>
              ) : (
                <div key={idx} />
              )
            ))}
          </div>
        </div>
      );
    }
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg border px-3 py-1.5 hover:bg-gray-50">Mois précédent</button>
          <div className="text-sm text-gray-600">Sélection: {selStart ? formatDateLabel(selStart) : '—'} → {selEnd ? formatDateLabel(selEnd) : '—'}</div>
          <button onClick={() => shiftMonth(1)} className="rounded-lg border px-3 py-1.5 hover:bg-gray-50">Mois suivant</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {renderMonth(view.year, view.month)}
          {renderMonth(view2.year, view2.month)}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={() => { setSelStart(''); setSelEnd(''); }} className="text-sm text-gray-600 hover:underline">Réinitialiser</button>
          <button onClick={apply} className="rounded-xl bg-gray-900 text-white px-4 py-2">Appliquer</button>
        </div>
      </div>
    );
  }

  const onUpdateAdvices = useCallback(async () => {
    setAi({ status: 'loading' });
    const groupMin = Math.min(...ages);
    const groupMax = Math.max(...ages);
    const season = computeSeason(destinationCountry, dateStart || undefined);
    const payload = {
      destinationCountry: destinationCountry.toUpperCase(),
      marketplaceCountry: 'FR',
      groupAge: { min: groupMin, max: groupMax },
      dates: (dateStart && dateEnd) ? { start: new Date(dateStart).toISOString(), end: new Date(dateEnd).toISOString() } : undefined,
      season,
      tripType: 'general',
      constraints: { maxTags: 6, promptVersion: PROMPT_VERSION },
    };

    try {
      const cacheKey = `explain:${JSON.stringify(payload)}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached) as { tags: TagItem[]; meta?: AiMeta };
        setAi({ status: 'success', tags: data.tags, meta: data.meta });
        return;
      }

      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setAi({ status: 'network-error' });
        return;
      }
      const data = (await res.json()) as { tags: TagItem[]; meta?: AiMeta };
      const tags = Array.isArray(data.tags) ? data.tags.slice(0, 6) : [];
      const meta = data.meta;
      sessionStorage.setItem(cacheKey, JSON.stringify({ tags, meta }));
      setAi({ status: 'success', tags, meta });
    } catch {
      setAi({ status: 'network-error' });
    }
  }, [ages, destinationCountry]);

  return (
    <main
      className="relative min-h-screen w-full text-white"
      style={{
        backgroundImage: "url('/images/hero.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative mx-auto max-w-7xl px-6 py-10 md:py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          {/* Carte verre dépoli */}
          <div className="max-w-md">
            <div className="rounded-2xl glass-card shadow-2xl p-5 md:p-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-semibold">Où partez-vous</div>
                  <select
                    className="mt-2 w-full rounded-xl bg-white/80 text-gray-900 px-4 py-3 outline-none focus:ring-2 focus:ring-white/60"
                    value={destinationCountry}
                    onChange={(e) => setDestinationCountry(e.target.value)}
                  >
                    <option value="FR">France</option>
                    <option value="IS">Islande</option>
                    <option value="TH">Thaïlande</option>
                    <option value="MA">Maroc</option>
                    <option value="BR">Brésil</option>
                    <option value="US">États-Unis</option>
                  </select>
                </div>

                <div>
                  <div className="text-sm font-semibold">Quand partez-vous</div>
                  <button
                    onClick={openDatePopup}
                    className="mt-2 w-full rounded-lg glass-input text-gray-900 px-3 py-2 text-left text-sm hover:brightness-110"
                  >
                    {dateStart && dateEnd
                      ? `Du ${dateStart || ''} au ${dateEnd || ''}`
                      : 'Sélectionner les dates (aller/retour)'}
                  </button>
                </div>

                <div>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    Avec qui ?
                    <span className="text-xs rounded-full bg-white/20 px-2 py-0.5" title="Adulte: ≥18 ans, Enfant: <18 ans.">i</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div className="rounded-lg glass-field px-3 py-2 text-gray-900 flex flex-col items-center text-center">
                      <div className="text-xs font-medium">Adultes</div>
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <button className="h-8 w-8 rounded-md bg-white border text-sm" onClick={() => setNumAdults((n) => Math.max(0, n - 1))}>−</button>
                        <span className="min-w-[2ch] text-center text-sm">{numAdults}</span>
                        <button className="h-8 w-8 rounded-md bg-white border text-sm" onClick={() => setNumAdults((n) => Math.min(20, n + 1))}>+</button>
                      </div>
                    </div>
                    <div className="rounded-lg glass-field px-3 py-2 text-gray-900 flex flex-col items-center text-center">
                      <div className="text-xs font-medium">Enfants</div>
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <button className="h-8 w-8 rounded-md bg-white border text-sm" onClick={() => setNumChildren((n) => Math.max(0, n - 1))}>−</button>
                        <span className="min-w-[2ch] text-center text-sm">{numChildren}</span>
                        <button className="h-8 w-8 rounded-md bg-white border text-sm" onClick={() => setNumChildren((n) => Math.min(20, n + 1))}>+</button>
                      </div>
                      
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-white/80">Total voyageurs: {travelers}</div>
                </div>

                {/* IA status hidden */}

                {/* IA tags chips hidden */}

                <div className="pt-1">
                  <button
                    onClick={onSubmit}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-medium text-gray-900 shadow hover:bg-gray-100 transition"
                  >
                    <span>Voir les recommandations</span>
                    <span className="transition-transform group-hover:translate-x-0.5">➡️</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Résultats */}
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-semibold">Votre checklist personnalisée</h2>
            <div className="mt-4 rounded-2xl glass-card p-5 md:p-6 shadow-xl border border-white/20">
              {result.status === 'idle' && (
                <p className="text-white/90">Remplissez le formulaire puis lancez la recherche.</p>
              )}
              {result.status === 'loading' && (
                <p className="text-white/90">Chargement…</p>
              )}
              {result.status === 'empty' && (
                <p className="text-white/90">0 résultat</p>
              )}
              {result.status === 'validation-error' && (
                <pre className="text-red-200 text-sm overflow-auto">
                  {JSON.stringify(result.issues, null, 2)}
                </pre>
              )}
              {result.status === 'network-error' && (
                <p className="text-red-200">Erreur réseau — réessaie plus tard.</p>
              )}
              {result.status === 'success' && (
                <>
                  <ul className={`${showAll ? 'max-h-96 overflow-y-auto pr-2 modern-scroll' : ''} divide-y divide-gray-200/60` }>
                    {(() => {
                      const displayed = showAll ? result.items : result.items.slice(0, 6);
                      const rawPriorities = displayed.map((it) => extractPriority(it.explain)).filter((n) => Number.isFinite(n));
                      const minP = rawPriorities.length > 0 ? Math.min(...rawPriorities) : 1;
                      return displayed.map((p, idx) => {
                        const raw = extractPriority(p.explain);
                        const dp = Number.isFinite(raw) ? Math.max(1, raw - (minP - 1)) : 3;
                        return (
                          <li key={p.asin} className="py-3 flex items-center gap-4">
                            <div className="flex-1 min-w-0 truncate">
                              <div className="rounded-xl bg-white/15 border border-white/30 backdrop-blur-md px-4 py-2 text-white font-medium truncate shadow-sm">
                                {p.label}
                              </div>
                            </div>
                            <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${dp === 1 ? 'badge-prio-1' : dp === 2 ? 'badge-prio-2' : 'badge-prio-3'}`}>P{dp}</span>
                            <a className="rounded-full bg-white/90 text-gray-900 px-3 py-1.5 hover:bg-white whitespace-nowrap text-sm shadow" href={`/api/affiliate/${p.asin}?marketplace=${p.marketplace}`} target="_blank">Acheter</a>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                  {!showAll && result.items.length > 6 && (
                    <div className="mt-4 text-center">
                      <button
                        onClick={() => setShowAll(true)}
                        className="inline-flex items-center justify-center rounded-md bg-gray-900 text-white px-4 py-2 hover:bg-black shadow"
                      >
                        Afficher tous les résultats ({result.items.length})
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {isDatePopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeDatePopup} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white text-gray-900 shadow-2xl p-5">
            <div className="text-lg font-semibold mb-3">Sélectionner vos dates</div>
            <DateRangePicker
              start={tmpStart}
              end={tmpEnd}
              onChange={(s, e) => {
                setTmpStart(s);
                setTmpEnd(e);
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={closeDatePopup} className="rounded-xl border px-4 py-2">Annuler</button>
              <button onClick={confirmDatePopup} className="rounded-xl bg-gray-900 text-white px-4 py-2">Valider</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
