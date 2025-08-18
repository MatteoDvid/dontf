export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Don&apos;t Forget</h1>
        <p className="mt-4 text-gray-600">
          Trouve en un clin d&apos;œil les accessoires essentiels pour ton prochain voyage.
        </p>
        <a
          href="/wizard"
          className="inline-block mt-8 rounded-md bg-black text-white px-5 py-3 hover:bg-gray-800 transition"
        >
          Démarrer le wizard
        </a>
      </div>
    </main>
  );
}
