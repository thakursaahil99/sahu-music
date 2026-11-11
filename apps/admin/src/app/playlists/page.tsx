'use client';

import { useAdmin } from '@/components/AdminShell';
import { CrudTable } from '@/components/CrudTable';

export default function PlaylistsPage() {
  const { user } = useAdmin();
  return (
    <CrudTable
      table="playlists"
      pk="id"
      title="Playlists"
      subtitle="All user playlists plus editorial playlists. New playlists created here are owned by you."
      orderBy="created_at"
      searchColumn="title"
      defaults={{ owner_id: user.id, is_public: true, is_editorial: true }}
      fields={[
        { key: 'title', label: 'Title', required: true, maxLength: 80, column: true },
        { key: 'description', label: 'Description', type: 'textarea', maxLength: 500 },
        { key: 'artwork_url', label: 'Artwork URL', type: 'url', maxLength: 500 },
        { key: 'is_public', label: 'Public', type: 'boolean', column: true },
        { key: 'is_editorial', label: 'Editorial', type: 'boolean', column: true },
        { key: 'owner_id', label: 'Owner ID', readOnly: true, column: true },
        { key: 'created_at', label: 'Created', readOnly: true, column: true },
      ]}
    />
  );
}
