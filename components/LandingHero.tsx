"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingHero() {
  const router = useRouter();
  const [fromCity, setFromCity] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [travelers, setTravelers] = useState<number>(1);

  function handleSearch() {
    try {
      const agesText = Array.from({ length: Math.max(1, travelers) })
        .map(() => "30")
        .join(",");
      const state = {
        travelers,
        agesText,
      };
      localStorage.setItem("wizardStateV1", JSON.stringify(state));
    } catch {}
    router.push("/wizard");
  }

  return (
    <section
      className="relative min-h-screen w-full text-white"
      style={{
        backgroundImage: "url('/images/hero.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative mx-auto max-w-7xl px-6 py-14 md:py-20 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          {/* Carte de recherche (gauche) */}
          <div className="max-w-md">
            <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-6 md:p-7">
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-semibold">Où partez-vous</div>
                  <input
                    value={fromCity}
                    onChange={(e) => setFromCity(e.target.value)}
                    placeholder="Ex : Paris"
                    className="mt-2 w-full rounded-xl bg-white/80 text-gray-900 placeholder:text-gray-500 px-4 py-3 outline-none focus:ring-2 focus:ring-white/60"
                  />
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
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => setTravelers(Math.max(1, travelers - 1))}
                      className="h-10 w-10 rounded-full bg-white/80 text-gray-900 text-lg leading-none"
                      aria-label="retirer un voyageur"
                    >
                      −
                    </button>
                    <div className="min-w-[150px] rounded-xl bg-white/80 px-4 py-2 text-gray-900 text-sm text-center">
                      {travelers} voyageur{travelers > 1 ? "s" : ""}
                    </div>
                    <button
                      onClick={() => setTravelers(travelers + 1)}
                      className="h-10 w-10 rounded-full bg-white/80 text-gray-900 text-lg leading-none"
                      aria-label="ajouter un voyageur"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSearch}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-medium text-gray-900 shadow hover:bg-gray-100 transition"
                  >
                    <span>Rechercher gratuitement</span>
                    <span className="transition-transform group-hover:translate-x-0.5">🔍</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Texte hero (droite) */}
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight">
              Choisissez votre destination et vos dates
            </h1>
            <p className="mt-6 text-white/90">
              Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae
              pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu
              aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas.
            </p>
            <p className="mt-4 text-white/90">
              Iaculis massa nisl malesuada lacinia interdum nunc posuere. Ut hendrerit semper vel class
              aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}


