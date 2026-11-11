'use client';

import { useAdmin } from '@/components/AdminShell';
import { CrudTable } from '@/components/CrudTable';
import { supabase } from '@/lib/supabase';

export default function ErrorsPage() {
  const { notify } = useAdmin();
  return (
    <CrudTable
      table="api_errors"
      pk="id"
      title="API errors"
      subtitle="Failures reported by the website, mobile apps and edge functions when a music provider request fails."
      orderBy="created_at"
      searchColumn="provider"
      canCreate={false}
      canEdit={false}
      headerActions={(reload) => (
        <button
          type="button"
          className="btn-outline"
          onClick={async () => {
            const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
            const { error } = await supabase!.from('api_errors').delete().lt('created_at', cutoff);
            notify(error ? error.message : 'Deleted errors older than 7 days', error ? 'error' : 'ok');
            reload();
          }}
        >
          Clear older than 7 days
        </button>
      )}
      fields={[
        { key: 'created_at', label: 'When', column: true },
        { key: 'provider', label: 'Provider', column: true },
        { key: 'endpoint', label: 'Endpoint', column: true },
        { key: 'status', label: 'HTTP', column: true },
        { key: 'message', label: 'Message', column: true },
        { key: 'client', label: 'Client', column: true },
      ]}
    />
  );
}
