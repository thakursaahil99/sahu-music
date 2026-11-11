'use client';

import { CrudTable } from '@/components/CrudTable';

export default function ArtistsPage() {
  return (
    <CrudTable
      table="artists"
      pk="id"
      title="Artists"
      orderBy="created_at"
      searchColumn="name"
      defaults={{ verified: false }}
      fields={[
        { key: 'name', label: 'Name', required: true, maxLength: 200, column: true },
        { key: 'provider', label: 'Provider', type: 'select', options: ['audius', 'jamendo', 'demo'], required: true, column: true, createOnly: true },
        { key: 'provider_artist_id', label: 'Provider artist ID', required: true, maxLength: 64, column: true, createOnly: true },
        { key: 'image_url', label: 'Image URL', type: 'url', maxLength: 500 },
        { key: 'bio', label: 'Bio', type: 'textarea', maxLength: 2000 },
        { key: 'verified', label: 'Verified', type: 'boolean', column: true },
      ]}
    />
  );
}
