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
type AiResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; tags: TagItem[] }
  | { status: 'network-error' };

export default function WizardPage() {
  const [destinationCountry, setDestinationCountry] = useState('FR');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [travelers, setTravelers] = useState(1);
  const [agesText, setAgesText] = useState('30');
  const [result, setResult] = useState<ApiResult>({ status: 'idle' });
  const [ai, setAi] = useState<AiResult>({ status: 'idle' });

  const ages = useMemo(
    () =>
      agesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 120),
    [agesText],
  );

  const onSubmit = useCallback(async () => {
    setResult({ status: 'loading' });
    try {
      const start = dateStart ? new Date(dateStart).toISOString() : new Date().toISOString();
      const end = dateEnd ? new Date(dateEnd).toISOString() : new Date().toISOString();
      const payload = {
        destinationCountry: destinationCountry.toUpperCase(),
        marketplaceCountry: 'FR',
        dates: { start, end },
        travelers,
        ages,
        tags: ai.status === 'success' ? ai.tags.map((t) => t.id) : undefined,
      };

      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      if (items.length === 0) setResult({ status: 'empty' });
      else setResult({ status: 'success', items });
    } catch {
      setResult({ status: 'network-error' });
    }
  }, [destinationCountry, travelers, ages, ai, dateStart, dateEnd]);

  // Persist wizardState in localStorage
  useEffect(() => {
    try {
      const state = {
        destinationCountry,
        travelers,
        agesText,
        dateStart,
        dateEnd,
      };
      localStorage.setItem('wizardStateV1', JSON.stringify(state));
    } catch {}
  }, [destinationCountry, travelers, agesText, dateStart, dateEnd]);

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
        }>;
        if (state.destinationCountry) setDestinationCountry(state.destinationCountry);
        if (typeof state.travelers === 'number') setTravelers(state.travelers);
        if (state.agesText) setAgesText(state.agesText);
        if (state.dateStart) setDateStart(state.dateStart);
        if (state.dateEnd) setDateEnd(state.dateEnd);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUpdateAdvices = useCallback(async () => {
    setAi({ status: 'loading' });
    const groupMin = Math.min(...ages);
    const groupMax = Math.max(...ages);
    const payload = {
      destinationCountry: destinationCountry.toUpperCase(),
      marketplaceCountry: 'FR',
      groupAge: { min: groupMin, max: groupMax },
      season: 'any',
      tripType: 'general',
      constraints: { maxTags: 6, promptVersion: PROMPT_VERSION },
    };

    try {
      const cacheKey = `explain:${JSON.stringify(payload)}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached) as { tags: TagItem[] };
        setAi({ status: 'success', tags: data.tags });
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
      const data = (await res.json()) as { tags: TagItem[] };
      const tags = Array.isArray(data.tags) ? data.tags.slice(0, 6) : [];
      sessionStorage.setItem(cacheKey, JSON.stringify({ tags }));
      setAi({ status: 'success', tags });
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
            <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-6 md:p-7">
              <div className="space-y-5">
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
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-gray-900">
                      <span className="text-sm font-medium">Départ</span>
                      <input
                        type="date"
                        value={dateStart}
                        onChange={(e) => setDateStart(e.target.value)}
                        className="ml-auto bg-transparent outline-none text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-gray-900">
                      <span className="text-sm font-medium">Arrivé</span>
                      <input
                        type="date"
                        value={dateEnd}
                        onChange={(e) => setDateEnd(e.target.value)}
                        className="ml-auto bg-transparent outline-none text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold">Avec qui ?</div>
                  <div className="mt-2 grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs mb-1">Voyageurs</label>
                      <input
                        type="number"
                        className="w-full rounded-xl bg-white/80 text-gray-900 px-4 py-3 outline-none"
                        value={travelers}
                        min={1}
                        max={20}
                        onChange={(e) => setTravelers(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1">Âges (séparés par des virgules)</label>
                      <input
                        className="w-full rounded-xl bg-white/80 text-gray-900 px-4 py-3 outline-none"
                        value={agesText}
                        onChange={(e) => setAgesText(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={onUpdateAdvices}
                    className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 hover:bg-white/20"
                  >
                    Analyser avec l’IA
                  </button>
                  {ai.status === 'loading' && (
                    <span className="text-sm text-white/90">Analyse en cours…</span>
                  )}
                  {ai.status === 'network-error' && (
                    <span className="text-sm text-red-300">Conseils indisponibles</span>
                  )}
                </div>

                {ai.status === 'success' && ai.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {ai.tags.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs"
                        title={`score ${Math.round(t.score * 100)}%`}
                      >
                        {t.id}
                        <span className="text-white/80">{Math.round(t.score * 100)}%</span>
                      </span>
                    ))}
                  </div>
                )}

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
            <h2 className="text-2xl md:text-3xl font-semibold">Vos recommandations</h2>
            <div className="mt-4 rounded-2xl border border-white/20 bg-white/5 backdrop-blur p-4">
              {result.status === 'idle' && (
                <p className="text-white/80">Remplissez le formulaire puis lancez la recherche.</p>
              )}
              {result.status === 'loading' && (
                <p className="text-white/80">Chargement…</p>
              )}
              {result.status === 'empty' && (
                <p className="text-white/80">0 résultat</p>
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
                <ul className="divide-y divide-white/10">
                  {result.items.map((p) => (
                    <li key={p.asin} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{p.label}</p>
                        <p className="text-xs text-white/80">ASIN: {p.asin}</p>
                        <p className="text-xs text-white/80">{p.explain.join(' • ')}</p>
                      </div>
                      <a
                        className="rounded-lg bg-white/90 text-gray-900 px-3 py-1.5 hover:bg-white"
                        href={`/api/affiliate/${p.asin}?marketplace=${p.marketplace}`}
                        target="_blank"
                      >
                        Acheter
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
