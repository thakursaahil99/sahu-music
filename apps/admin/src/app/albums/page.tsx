'use client';

import { CrudTable } from '@/components/CrudTable';

export default function AlbumsPage() {
  return (
    <CrudTable
      table="albums"
      pk="id"
      title="Albums"
      orderBy="created_at"
      searchColumn="title"
      fields={[
        { key: 'title', label: 'Title', required: true, maxLength: 200, column: true },
        { key: 'provider', label: 'Provider', type: 'select', options: ['audius', 'jamendo', 'demo'], required: true, column: true, createOnly: true },
        { key: 'provider_album_id', label: 'Provider album ID', required: true, maxLength: 64, column: true, createOnly: true },
        { key: 'artwork_url', label: 'Artwork URL', type: 'url', maxLength: 500 },
        { key: 'release_date', label: 'Release date', type: 'date', column: true },
      ]}
    />
  );
}
