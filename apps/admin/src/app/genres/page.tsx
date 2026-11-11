'use client';

import { CrudTable } from '@/components/CrudTable';

export default function GenresPage() {
  return (
    <CrudTable
      table="genres"
      pk="slug"
      title="Genres"
      subtitle='Categories and how each is filled from provider APIs. Strategy is JSON: {"kind":"genre","genre":"Devotional"}, {"kind":"search","queries":["hindi"]}, {"kind":"trending"}, {"kind":"radio","tags":["bollywood"]} or {"kind":"youtube-chart"}.'
      orderBy="sort_order"
      ascending
      searchColumn="name"
      defaults={{ enabled: true, sort_order: 0, strategy: { kind: 'trending' } }}
      fields={[
        { key: 'slug', label: 'Slug (a-z, 0-9, hyphen)', required: true, maxLength: 40, column: true, createOnly: true },
        { key: 'name', label: 'Name', required: true, maxLength: 60, column: true },
        { key: 'description', label: 'Description', type: 'textarea', maxLength: 300 },
        { key: 'strategy', label: 'Strategy (JSON)', type: 'json', required: true, column: true },
        { key: 'sort_order', label: 'Sort order', type: 'number', column: true },
        { key: 'enabled', label: 'Enabled', type: 'boolean', column: true },
      ]}
    />
  );
}
