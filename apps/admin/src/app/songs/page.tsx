'use client';

import { CrudTable } from '@/components/CrudTable';

export default function SongsPage() {
  return (
    <CrudTable
      table="songs"
      pk="id"
      title="Songs"
      subtitle="Curated catalogue. A song can only be made public while it has an approved rights record with streaming permission; the database rejects it otherwise."
      orderBy="created_at"
      searchColumn="title"
      defaults={{ is_public: false, duration: 0 }}
      fields={[
        { key: 'title', label: 'Title', required: true, maxLength: 300, column: true },
        { key: 'artist_name', label: 'Artist', required: true, maxLength: 200, column: true },
        { key: 'provider', label: 'Provider', type: 'select', options: ['audius', 'jamendo', 'demo'], required: true, column: true, createOnly: true },
        { key: 'provider_track_id', label: 'Provider track ID', required: true, maxLength: 64, createOnly: true },
        { key: 'stream_url', label: 'Stream URL (from the provider API)', type: 'url', required: true, maxLength: 500 },
        { key: 'artwork_url', label: 'Artwork URL', type: 'url', maxLength: 500 },
        { key: 'permalink', label: 'Provider page URL', type: 'url', maxLength: 500 },
        { key: 'duration', label: 'Duration (seconds)', type: 'number' },
        { key: 'genre', label: 'Genre', maxLength: 60, column: true },
        { key: 'is_public', label: 'Public (requires approved rights)', type: 'boolean', column: true },
      ]}
    />
  );
}
