'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
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
    
    // Sauvegarder les données de voyage dans sessionStorage pour la page résultats
    const tripData = {
      destination: destinationCountry,
      startDate: dateStart,
      endDate: dateEnd,
      travelers,
      adults: numAdults,
      children: numChildren,
      ages,
      activities: [] // Pas encore implémenté
    };
    
    try {
      sessionStorage.setItem('tripData', JSON.stringify(tripData));
    } catch {}

    // Simuler un petit délai pour l'effet de chargement
    setTimeout(() => {
      router.push('/results');
    }, 1500);
  }, [router, destinationCountry, dateStart, dateEnd, travelers, numAdults, numChildren, ages]);

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
        <div className="p-4 rounded-xl glass-field border border-white/20">
          <div className="text-center font-medium mb-3 text-gray-900">{String(m).padStart(2, '0')}/{y}</div>
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
                  className={`h-9 rounded-lg text-sm font-medium transition-all ${
                    cell.key < todayKey
                      ? 'bg-gray-100/50 text-gray-400 cursor-not-allowed backdrop-blur-sm'
                      : isInRange(cell.key)
                      ? 'bg-blue-500 text-white shadow-lg ring-2 ring-blue-300'
                      : selStart === cell.key || selEnd === cell.key
                      ? 'bg-white text-gray-900 shadow-xl ring-2 ring-white/50 scale-105'
                      : 'bg-white/30 hover:bg-white/50 text-gray-900 backdrop-blur-sm border border-white/20 hover:scale-105'
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
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg bg-white/20 border border-white/30 px-3 py-2 hover:bg-white/30 text-white backdrop-blur-sm transition-all">← Précédent</button>
          <div className="text-sm text-white/90 bg-white/10 rounded-lg px-3 py-1 backdrop-blur-sm">
            {selStart ? formatDateLabel(selStart) : '—'} → {selEnd ? formatDateLabel(selEnd) : '—'}
          </div>
          <button onClick={() => shiftMonth(1)} className="rounded-lg bg-white/20 border border-white/30 px-3 py-2 hover:bg-white/30 text-white backdrop-blur-sm transition-all">Suivant →</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {renderMonth(view.year, view.month)}
          {renderMonth(view2.year, view2.month)}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <button onClick={() => { setSelStart(''); setSelEnd(''); }} className="text-sm text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 backdrop-blur-sm transition-all">Réinitialiser</button>
          <button onClick={apply} className="rounded-xl bg-white text-gray-900 px-6 py-2 hover:bg-white/90 font-medium shadow-lg transition-all">Appliquer</button>
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
  }, [ages, destinationCountry, dateStart, dateEnd]);

  return (
    <main className="relative w-full text-white min-h-screen">
      {/* Background fixe qui ne bouge jamais */}
      <div 
        className="fixed inset-0 w-full h-screen -z-10"
        style={{
          backgroundImage: "url('/images/hero.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="fixed inset-0 bg-black/0 -z-10" />

      {/* Layout initial - avant recherche */}
      {result.status === 'idle' && (
        <div className="relative flex min-h-screen flex-col items-center justify-start px-6">
          {/* Header */}
          <div className="text-center mt-20 mb-8">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 font-airbnb">
              Voyagez l&apos;esprit léger<br />avec Don&apos;t Forget
            </h1>
            <p className="text-lg md:text-xl opacity-90 font-airbnb">
              Votre checklist sur mesure prête en 30s<br />sans stress ni oubli
            </p>
          </div>

          {/* Hero Form Container */}
          <div className="hero-form">
            {/* Grille des champs */}
            <div className="hero-fields">
              {/* Destination */}
              <div>
                <div className="hero-label">Où partez-vous ?</div>
                <select
                  className="hero-select w-full"
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

              {/* Dates */}
              <div>
                <div className="hero-label">Quand partez-vous ?</div>
                <div className="date-row">
                  <button
                    onClick={openDatePopup}
                    className="hero-input flex flex-col justify-center text-left"
                  >
                    <div className="text-xs opacity-70 mb-1">Départ</div>
                    <div className="text-sm">
                      {dateStart ? formatDateLabel(dateStart) : '--/--/----'}
                    </div>
                  </button>
                  <button
                    onClick={openDatePopup}
                    className="hero-input flex flex-col justify-center text-left"
                  >
                    <div className="text-xs opacity-70 mb-1">Retour</div>
                    <div className="text-sm">
                      {dateEnd ? formatDateLabel(dateEnd) : '--/--/----'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Voyageurs */}
              <div>
                <div className="hero-label">Avec qui ?</div>
                <div className="hero-input flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-xs opacity-70 mb-1">Adultes</div>
                      <div className="flex items-center gap-2">
                        <button 
                          type="button"
                          className="w-6 h-6 rounded bg-white/20 text-sm hover:bg-white/30 flex items-center justify-center" 
                          onClick={() => setNumAdults((n) => Math.max(0, n - 1))}
                        >
                          −
                        </button>
                        <span className="min-w-[1ch] text-center text-sm">{numAdults}</span>
                        <button 
                          type="button"
                          className="w-6 h-6 rounded bg-white/20 text-sm hover:bg-white/30 flex items-center justify-center" 
                          onClick={() => setNumAdults((n) => Math.min(20, n + 1))}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs opacity-70 mb-1">Enfants</div>
                      <div className="flex items-center gap-2">
                        <button 
                          type="button"
                          className="w-6 h-6 rounded bg-white/20 text-sm hover:bg-white/30 flex items-center justify-center" 
                          onClick={() => setNumChildren((n) => Math.max(0, n - 1))}
                        >
                          −
                        </button>
                        <span className="min-w-[1ch] text-center text-sm">{numChildren}</span>
                        <button 
                          type="button"
                          className="w-6 h-6 rounded bg-white/20 text-sm hover:bg-white/30 flex items-center justify-center" 
                          onClick={() => setNumChildren((n) => Math.min(20, n + 1))}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs opacity-70">
                    Total: {travelers}
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={onSubmit}
              className="hero-cta"
            >
              <span>Rechercher gratuitement</span>
              <svg className="hero-cta-icon" width="19" height="21" viewBox="0 0 19 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.17781 16.8556C3.73068 16.8556 2.50606 16.3543 1.50395 15.3517C0.50185 14.349 0.000531479 13.1244 4.21474e-07 11.6778C-0.000530636 10.2312 0.500787 9.00659 1.50395 8.00395C2.50712 7.00132 3.73174 6.5 5.17781 6.5C6.62388 6.5 7.84876 7.00132 8.85246 8.00395C9.85616 9.00659 10.3572 10.2312 10.3556 11.6778C10.3556 12.262 10.2627 12.8129 10.0768 13.3307C9.89094 13.8485 9.63869 14.3065 9.32006 14.7048L13.7809 19.1657C13.927 19.3118 14 19.4976 14 19.7233C14 19.949 13.927 20.1349 13.7809 20.2809C13.6349 20.427 13.449 20.5 13.2233 20.5C12.9976 20.5 12.8118 20.427 12.6657 20.2809L8.20484 15.8201C7.80654 16.1387 7.34851 16.3909 6.83073 16.5768C6.31294 16.7627 5.76197 16.8556 5.17781 16.8556ZM5.17781 15.2624C6.17354 15.2624 7.02005 14.9141 7.71733 14.2173C8.4146 13.5206 8.76298 12.6741 8.76245 11.6778C8.76192 10.6815 8.41354 9.83531 7.71733 9.13909C7.02111 8.44287 6.1746 8.09423 5.17781 8.09317C4.18102 8.09211 3.33478 8.44075 2.63909 9.13909C1.9434 9.83743 1.59477 10.6837 1.59317 11.6778C1.59158 12.6719 1.94022 13.5185 2.63909 14.2173C3.33796 14.9162 4.1842 15.2646 5.17781 15.2624Z" fill="currentColor"/>
                <path d="M11.85 4.35L14.05 3.525L11.85 2.69917L11.025 0.5L10.1992 2.69917L8 3.525L10.1992 4.35L11.025 6.54999L11.85 4.35ZM16.25 8.75001L19 7.65L16.25 6.54999L15.15 3.8L14.05 6.54999L11.3 7.65L14.05 8.75001L15.15 11.5L16.25 8.75001Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* État de chargement pendant redirection */}
      {result.status === 'loading' && (
        <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-6"></div>
            <p className="text-white/90 text-lg">Génération de votre checklist personnalisée...</p>
            <p className="text-white/70 text-sm mt-2">Analyse de vos critères en cours</p>
          </div>
        </div>
      )}
      
      {isDatePopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeDatePopup} />
          <div className="relative z-10 w-full max-w-md rounded-2xl glass-card text-white shadow-2xl p-6 border border-white/30">
            <div className="text-lg font-semibold mb-4 text-center">Sélectionner vos dates</div>
            <DateRangePicker
              start={tmpStart}
              end={tmpEnd}
              onChange={(s, e) => {
                setTmpStart(s);
                setTmpEnd(e);
              }}
            />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeDatePopup} className="rounded-xl bg-white/20 border border-white/30 text-white px-5 py-2 hover:bg-white/30 backdrop-blur-sm transition-all">Annuler</button>
              <button onClick={confirmDatePopup} className="rounded-xl bg-white text-gray-900 px-5 py-2 hover:bg-white/90 font-medium shadow-lg transition-all">Valider</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
