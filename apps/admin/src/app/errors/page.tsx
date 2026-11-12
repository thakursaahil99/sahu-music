'use client';

import { useAdmin } from '@/components/AdminShell';
import { CrudTable } from '@/components/CrudTable';
import { api } from '@/lib/backend';

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
            try {
              const r = await api<{ deleted: number }>('POST', 'admin/prune-errors', { olderThanDays: 7 });
              notify(`Deleted ${r.deleted} error${r.deleted === 1 ? '' : 's'} older than 7 days`);
            } catch (e) {
              notify(e instanceof Error ? e.message : 'Failed', 'error');
            }
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
