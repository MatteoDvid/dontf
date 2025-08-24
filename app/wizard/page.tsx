'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PROMPT_VERSION } from '@/lib/tags';
import { WizardStep } from '@/components/WizardStep';

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
      const payload = {
        destinationCountry: destinationCountry.toUpperCase(),
        marketplaceCountry: 'FR',
        dates: { start: new Date().toISOString(), end: new Date().toISOString() },
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
        console.log('[Wizard] Validation error', { destinationCountry, ages, travelers });
        return;
      }

      if (!res.ok) {
        setResult({ status: 'network-error' });
        console.log('[Wizard] Network error', { destinationCountry, ages, travelers });
        return;
      }

      const items = (await res.json()) as Array<ProductItem>;

      if (items.length === 0) {
        setResult({ status: 'empty' });
      } else {
        setResult({ status: 'success', items });
      }

      console.log('[Wizard] Query summary', {
        destinationCountry,
        travelers,
        ages,
        resultCount: items.length,
      });
    } catch {
      setResult({ status: 'network-error' });
      console.log('[Wizard] Network error (exception)', { destinationCountry, ages, travelers });
    }
  }, [destinationCountry, travelers, ages, ai]);

  // Persist wizardState in localStorage
  useEffect(() => {
    try {
      const state = {
        destinationCountry,
        travelers,
        agesText,
      };
      localStorage.setItem('wizardStateV1', JSON.stringify(state));
    } catch {}
  }, [destinationCountry, travelers, agesText]);

  // Load wizardState from localStorage on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('wizardStateV1');
      if (raw) {
        const state = JSON.parse(raw) as Partial<{
          destinationCountry: string;
          travelers: number;
          agesText: string;
        }>;
        if (state.destinationCountry) setDestinationCountry(state.destinationCountry);
        if (typeof state.travelers === 'number') setTravelers(state.travelers);
        if (state.agesText) setAgesText(state.agesText);
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

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const next = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, 2));
  };
  const prev = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-semibold">Wizard</h1>

        <WizardStep stepKey={step} direction={direction}>
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium">Pays</label>
                <select
                  className="mt-1 w-full rounded border px-3 py-2 bg-white"
                  value={destinationCountry}
                  onChange={(e) => setDestinationCountry(e.target.value)}
                >
                  <option value="IS">Islande</option>
                  <option value="TH">Thaïlande</option>
                  <option value="MA">Maroc</option>
                  <option value="BR">Brésil</option>
                  <option value="US">États-Unis</option>
                </select>
              </div>
              {/* Marketplace fixé à FR par défaut (non modifiable) */}
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium">Voyageurs</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={travelers}
                  min={1}
                  max={20}
                  onChange={(e) => setTravelers(Number(e.target.value))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium">Âges (séparés par des virgules)</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  value={agesText}
                  onChange={(e) => setAgesText(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={onUpdateAdvices}
                  className="rounded-md border px-4 py-2 hover:bg-gray-50"
                >
                  Mettre à jour les conseils
                </button>
                {ai.status === 'loading' && (
                  <span className="text-sm text-gray-600">Analyse en cours…</span>
                )}
                {ai.status === 'network-error' && (
                  <span className="text-sm text-red-600">Conseils indisponibles</span>
                )}
              </div>

              {ai.status === 'success' && ai.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ai.tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                      title={`score ${Math.round(t.score * 100)}%`}
                    >
                      {t.id}
                      <span className="text-gray-500">{Math.round(t.score * 100)}%</span>
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={onSubmit}
                className="rounded-md bg-black text-white px-5 py-2 hover:bg-gray-800"
              >
                Rechercher
              </button>

              {result.status === 'loading' && <p className="text-gray-600">Chargement…</p>}
              {result.status === 'empty' && <p className="text-gray-600">0 résultat</p>}
              {result.status === 'validation-error' && (
                <pre className="text-red-600 text-sm overflow-auto">
                  {JSON.stringify(result.issues, null, 2)}
                </pre>
              )}
              {result.status === 'network-error' && (
                <p className="text-red-600">Erreur réseau — réessaie plus tard.</p>
              )}
              {result.status === 'success' && (
                <ul className="divide-y rounded border">
                  {result.items.map((p) => (
                    <li key={p.asin} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{p.label}</p>
                        <p className="text-xs text-gray-500">ASIN: {p.asin}</p>
                        <p className="text-xs text-gray-500">{p.explain.join(' • ')}</p>
                      </div>
                      <a
                        className="text-blue-600 hover:underline"
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
          )}
        </WizardStep>

        <div className="flex items-center justify-between">
          <button
            onClick={prev}
            disabled={step === 0}
            className="rounded border px-4 py-2 disabled:opacity-40"
          >
            Précédent
          </button>
          <div className="text-sm text-gray-500">Étape {step + 1} / 3</div>
          <button
            onClick={next}
            disabled={step === 2}
            className="rounded border px-4 py-2 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      </div>
    </main>
  );
}
