'use client';

import React, { useEffect, useState } from 'react';

type ProductItem = {
  label: string;
  asin: string;
  marketplace: string;
  price?: string;
  originalPrice?: string;
  image?: string;
  description?: string;
  availability?: string;
  inStock?: boolean;
};

type TripSummary = {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  adults: number;
  children: number;
  activities?: string[];
};

export default function ResultsPage() {
  const [tripSummary, setTripSummary] = useState<TripSummary>({
    destination: "Marseille",
    startDate: "04/08/2025", 
    endDate: "18/08/2025",
    travelers: 3,
    adults: 2,
    children: 1,
    activities: ["Tennis", "Surf", "Via ferrata"]
  });

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiLoading, setApiLoading] = useState(false);

  // Charger les données du voyage depuis sessionStorage
  useEffect(() => {
    try {
      const tripDataRaw = sessionStorage.getItem('tripData');
      if (tripDataRaw) {
        const tripData = JSON.parse(tripDataRaw);
        
        // Formatter les dates
        const formatDate = (dateStr: string) => {
          if (!dateStr) return '';
          const date = new Date(dateStr);
          return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        };

        setTripSummary({
          destination: getDestinationName(tripData.destinationCountry || tripData.destination) || "Destination",
          startDate: formatDate(tripData.dateStart || tripData.startDate),
          endDate: formatDate(tripData.dateEnd || tripData.endDate),
          travelers: tripData.travelers || 1,
          adults: tripData.numAdults || tripData.adults || 1,
          children: tripData.numChildren || tripData.children || 0,
          activities: (tripData.activities && tripData.activities.length > 0) ? tripData.activities : ["Voyage découverte"]
        });
      }
    } catch (err) {
      console.warn('Erreur lors du chargement des données de voyage:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Charger les recommandations depuis l'API
  useEffect(() => {
    const loadRecommendations = async () => {
      if (isLoading) return; // Attendre que les données du voyage soient chargées
      
      setApiLoading(true);
      try {
        const tripDataRaw = sessionStorage.getItem('tripData');
        if (!tripDataRaw) {
          console.warn('Aucune donnée de voyage trouvée');
          return;
        }

        const tripData = JSON.parse(tripDataRaw);
        
        // Formatter les âges en array de nombres
        const ages = Array.isArray(tripData.ages) 
          ? tripData.ages.filter((age: number) => typeof age === 'number')
          : [30]; // Fallback
          
        // Formatter les dates en ISO
        const start = (tripData.dateStart || tripData.startDate) ? new Date(tripData.dateStart || tripData.startDate).toISOString() : new Date().toISOString();
        const end = (tripData.dateEnd || tripData.endDate) ? new Date(tripData.dateEnd || tripData.endDate).toISOString() : new Date().toISOString();

        // Préparer le payload pour l'API recommend
        const recommendPayload = {
          destinationCountry: tripData.destinationCountry || tripData.destination || 'FR',
          marketplaceCountry: 'FR',
          dates: { start, end },
          travelers: tripData.travelers || 1,
          ages: ages
        };

        console.log('Envoi de la requête:', recommendPayload);

        // Appel à l'API de recommandation
        const response = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recommendPayload)
        });

        if (!response.ok) {
          throw new Error(`Erreur API: ${response.status}`);
        }

        const apiProducts = await response.json();
        
        // Transformer les données API vers notre format
        const transformedProducts: ProductItem[] = apiProducts.map((product: any, index: number) => ({
          label: product.label || 'Produit sans nom',
          asin: product.asin || `unknown-${index}`,
          marketplace: product.marketplace || 'FR',
          price: undefined, // Sera géré par l'affichage (pas de prix dans l'API recommend)
          originalPrice: undefined,
          description: `Recommandé pour votre voyage. ${product.explain?.filter((e: string) => e.startsWith('destination=') || e.startsWith('marketplace=')).join(' | ') || 'Sélectionné par IA selon votre destination'}`,
          availability: "Voir sur Amazon",
          inStock: true // Disponible via Amazon
        }));

        setProducts(transformedProducts.slice(0, 10)); // Limiter à 10 produits
        
      } catch (error) {
        console.error('Erreur lors du chargement des recommandations:', error);
        // En cas d'erreur, garder des produits mock
        setProducts([
          {
            label: "Produit de voyage recommandé",
            asin: "B000000001",
            marketplace: "FR",
            price: "24,99€",
            originalPrice: "29,99€", 
            description: "Erreur lors du chargement des données. Veuillez réessayer.",
            availability: "Livré en 48h ⚡",
            inStock: true
          }
        ]);
      } finally {
        setApiLoading(false);
      }
    };

    loadRecommendations();
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convertir code pays en nom
  function getDestinationName(countryCode: string): string {
    const countries: Record<string, string> = {
      'FR': 'France',
      'IS': 'Islande', 
      'TH': 'Thaïlande',
      'MA': 'Maroc',
      'BR': 'Brésil',
      'US': 'États-Unis'
    };
    return countries[countryCode] || countryCode;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">Chargement de vos résultats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar - Récapitulatif du voyage */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl p-6 sticky top-8" style={{backgroundColor: '#1a1a1a'}}>
              <div className="mb-4">
                <div className="text-sm text-gray-300 mb-1 flex items-center gap-2">
                  {tripSummary.destination} {tripSummary.startDate && new Date(tripSummary.startDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  <span>✏️</span>
                </div>
                <h2 className="text-xl font-bold text-white">Récapitulatif de votre voyage</h2>
              </div>

              <div className="space-y-4 text-white">
                <div>
                  <div className="text-sm text-gray-300">Destination :</div>
                  <div className="font-medium">{tripSummary.destination}</div>
                </div>

                <div>
                  <div className="text-sm text-gray-300">Dates :</div>
                  <div className="font-medium">{tripSummary.startDate} - {tripSummary.endDate}</div>
                </div>

                <div>
                  <div className="text-sm text-gray-300">Voyageurs :</div>
                  <div className="font-medium">{tripSummary.adults} adultes, {tripSummary.children} enfant</div>
                </div>

                <div>
                  <div className="text-sm text-gray-300">Vos activités :</div>
                  <div className="font-medium">{tripSummary.activities?.join(', ').toLowerCase()}</div>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <a href="/wizard" className="w-full bg-white hover:bg-gray-100 text-gray-900 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium">
                  <span>Modifier le voyage</span>
                  <span>✏️</span>
                </a>
                <button className="w-full text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 hover:opacity-90" style={{backgroundColor: '#1a1a1a'}}>
                  <span>Télécharger la checklist</span>
                  <span>⬇️</span>
                </button>
              </div>
            </div>
          </div>

          {/* Résultats */}
          <div className="lg:col-span-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Votre checklist personnalisé</h1>
              <p className="text-gray-600">
                Recommandations personnalisées pour votre voyage à {tripSummary.destination}. 
                Ces produits ont été sélectionnés selon vos activités et votre destination.
              </p>
            </div>

            <div className="mb-4 text-sm font-medium text-gray-700">
              Produits conseillés :
            </div>

            {apiLoading && (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4 mx-auto"></div>
                <p className="text-gray-600">Génération de vos recommandations personnalisées...</p>
              </div>
            )}

            {!apiLoading && products.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-600">Aucune recommandation trouvée pour ce voyage.</p>
              </div>
            )}

            <div className="space-y-4">
              {!apiLoading && products.map((product, index) => (
                <div key={product.asin} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                  <div className="flex gap-4">
                    {/* Image placeholder */}
                    <div className="flex-shrink-0">
                      <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                        <div className="text-gray-400 text-xs text-center">
                          <div>📦</div>
                          <div className="text-[10px] mt-1">Image à venir</div>
                        </div>
                      </div>
                    </div>

                    {/* Contenu */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 text-lg leading-tight">
                          {product.label}
                        </h3>
                        {product.price && (
                          <div className="text-right ml-4">
                            <div className="font-bold text-gray-900">{product.price}</div>
                            {product.originalPrice && (
                              <div className="text-sm text-gray-500 line-through">{product.originalPrice}</div>
                            )}
                          </div>
                        )}
                      </div>

                      <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                        {product.description}
                      </p>

                      <div className="flex items-center gap-4">
                        <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          Recommandation IA
                        </div>
                        
                        <div className="flex gap-2 ml-auto">
                          <a 
                            href={`/api/affiliate/${product.asin}?marketplace=${product.marketplace}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90 flex items-center gap-1"
                            style={{backgroundColor: '#1a1a1a'}}
                          >
                            Voir plus sur amazon
                            <span className="text-orange-400">a</span>
                          </a>
                          
                          {product.inStock ? (
                            <button 
                              className="text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                              style={{backgroundColor: '#099142'}}
                            >
                              J&apos;ai déjà prévu ✓
                            </button>
                          ) : (
                            <button 
                              className="text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                              style={{backgroundColor: '#099142'}}
                            >
                              Je n&apos;ai pas prévu ✕
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Badge IA pour les produits prioritaires */}
                  {product.description?.includes('mustHave=true') && (
                    <div className="mt-4 p-3 rounded-lg" style={{backgroundColor: '#E8F5E8', border: '1px solid #099142'}}>
                      <div className="font-medium text-sm" style={{color: '#099142'}}>
                        ⭐ Produit essentiel identifié par l&apos;IA
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}