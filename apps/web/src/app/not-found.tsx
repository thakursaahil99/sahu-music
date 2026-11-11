import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <p className="text-6xl font-extrabold text-gold">404</p>
      <h1 className="mt-3 text-2xl font-bold text-white">Page not found</h1>
      <p className="mt-2 text-sm text-muted">That page does not exist or has moved.</p>
      <Link href="/" className="btn-gold mt-6">
        Back to Home
      </Link>
    </div>
  );
}
