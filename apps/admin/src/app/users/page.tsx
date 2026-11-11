'use client';

import { CrudTable } from '@/components/CrudTable';

export default function UsersPage() {
  return (
    <CrudTable
      table="profiles"
      pk="id"
      title="Users"
      subtitle="Change a user's role or block them. Blocked users can still listen as guests but cannot save data or use the admin console."
      orderBy="created_at"
      searchColumn="display_name"
      canCreate={false}
      canDelete={false}
      fields={[
        { key: 'display_name', label: 'Display name', maxLength: 50, column: true },
        { key: 'id', label: 'User ID', readOnly: true, column: true },
        { key: 'role', label: 'Role', type: 'select', options: ['user', 'admin'], required: true, column: true },
        { key: 'is_blocked', label: 'Blocked', type: 'boolean', column: true },
        { key: 'created_at', label: 'Joined', readOnly: true, column: true },
      ]}
    />
  );
}
