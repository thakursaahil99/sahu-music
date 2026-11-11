'use client';

import { CrudTable } from '@/components/CrudTable';

export default function ProvidersPage() {
  return (
    <CrudTable
      table="music_providers"
      pk="id"
      title="Music providers"
      subtitle="Disabling a provider here switches it off in the website and apps on their next load. API keys are never stored in the database: they are set as environment variables in each app."
      orderBy="id"
      ascending
      canDelete={false}
      defaults={{ enabled: true, requires_key: false }}
      fields={[
        { key: 'id', label: 'ID (lowercase)', required: true, maxLength: 32, column: true, createOnly: true },
        { key: 'name', label: 'Name', required: true, maxLength: 80, column: true },
        { key: 'homepage', label: 'Homepage', type: 'url', maxLength: 300 },
        { key: 'api_base_url', label: 'API base URL', type: 'url', maxLength: 300, column: true },
        { key: 'requires_key', label: 'Requires API key', type: 'boolean', column: true },
        { key: 'enabled', label: 'Enabled', type: 'boolean', column: true },
        { key: 'terms_note', label: 'Licence / terms note', type: 'textarea', maxLength: 1000 },
        { key: 'last_sync_at', label: 'Last sync', readOnly: true, column: true },
      ]}
    />
  );
}
