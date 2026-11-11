'use client';

import { Suspense } from 'react';
import { CollectionView } from '@/components/CollectionView';
import { ListSkeleton } from '@/components/ui';

export default function CollectionPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CollectionView />
    </Suspense>
  );
}
