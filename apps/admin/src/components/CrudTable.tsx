'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { sanitizeQuery } from '@sahu/shared';
import { adminTable } from '@/lib/backend';
import { PageTitle, useAdmin } from './AdminShell';

export interface Field {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json' | 'url' | 'date';
  options?: string[];
  required?: boolean;
  maxLength?: number;
  /** show as a column in the table */
  column?: boolean;
  /** shown in the form but not editable after creation */
  createOnly?: boolean;
  /** never editable */
  readOnly?: boolean;
}

export type Row = Record<string, unknown>;

interface Props {
  table: string;
  pk: string;
  title: string;
  subtitle?: string;
  fields: Field[];
  orderBy: string;
  ascending?: boolean;
  searchColumn?: string;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  defaults?: Row;
  rowActions?: (row: Row, reload: () => void) => ReactNode;
  headerActions?: (reload: () => void) => ReactNode;
}

const PAGE = 25;

function display(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 70 ? `${s.slice(0, 70)}…` : s;
}

export function CrudTable(p: Props) {
  const { notify } = useAdmin();
  const { table, pk, fields, orderBy, ascending = false, searchColumn } = p;
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: Row; isNew: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const term = searchColumn ? sanitizeQuery(search, 60).trim() : '';
    adminTable.list(table, { orderBy, ascending, offset: page * PAGE, limit: PAGE, search: term || undefined }).then(
      (r) => {
        if (!alive) return;
        setError(null);
        setRows(r.rows);
        setCount(r.count);
        setLoading(false);
      },
      (e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Could not load records.');
        setRows([]);
        setCount(0);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [table, orderBy, ascending, page, search, searchColumn, tick]);

  const save = async (form: Row, isNew: boolean) => {
    const payload: Row = {};
    for (const f of fields) {
      if (f.readOnly || (!isNew && f.createOnly)) continue;
      let v = form[f.key];
      if (f.type === 'boolean') v = !!v;
      else if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
      else if (f.type === 'json') {
        try {
          v = typeof v === 'string' ? JSON.parse(v) : v;
        } catch {
          return notify(`${f.label}: invalid JSON`, 'error');
        }
      } else if (typeof v === 'string') {
        v = v.trim();
        if (v === '') v = null;
      }
      if (f.required && (v === null || v === undefined || Number.isNaN(v))) return notify(`${f.label} is required`, 'error');
      if (f.type === 'number' && Number.isNaN(v)) return notify(`${f.label} must be a number`, 'error');
      if (f.type === 'url' && v && !/^https:\/\//.test(String(v))) return notify(`${f.label} must start with https://`, 'error');
      if (f.maxLength && typeof v === 'string' && v.length > f.maxLength) return notify(`${f.label} is too long (max ${f.maxLength})`, 'error');
      payload[f.key] = v;
    }
    try {
      if (isNew) await adminTable.insert(table, { ...p.defaults, ...payload });
      else await adminTable.update(table, form[pk], payload);
    } catch (e) {
      return notify(e instanceof Error ? e.message : 'Save failed', 'error');
    }
    notify(isNew ? 'Created' : 'Saved');
    setEditing(null);
    reload();
  };

  const remove = async (id: unknown) => {
    setConfirmDelete(null);
    try {
      await adminTable.remove(table, id);
    } catch (e) {
      return notify(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
    notify('Deleted');
    reload();
  };

  const cols = fields.filter((f) => f.column);
  const pages = Math.max(1, Math.ceil(count / PAGE));

  return (
    <>
      <PageTitle title={p.title} subtitle={p.subtitle}>
        <div className="flex flex-wrap gap-2">
          {p.headerActions?.(reload)}
          {p.canCreate !== false && (
            <button type="button" className="btn-gold" onClick={() => setEditing({ row: { ...p.defaults }, isNew: true })}>+ New</button>
          )}
        </div>
      </PageTitle>

      {searchColumn && (
        <input
          type="search"
          className="input mb-4 max-w-sm"
          placeholder={`Search ${p.title.toLowerCase()}…`}
          aria-label={`Search ${p.title}`}
          value={search}
          maxLength={60}
          onChange={(e) => {
            setPage(0);
            setSearch(e.target.value);
          }}
        />
      )}

      {error && <p className="mb-4 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>}

      <div className="overflow-x-auto rounded-xl ring-1 ring-white/5">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-coal text-xs uppercase tracking-wider text-muted">
            <tr>
              {cols.map((c) => <th key={c.key} scope="col" className="px-4 py-3 font-semibold">{c.label}</th>)}
              <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-coal-line">
            {loading ? (
              <tr><td colSpan={cols.length + 1} className="px-4 py-8 text-center text-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={cols.length + 1} className="px-4 py-8 text-center text-muted">No records.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r[pk])} className="hover:bg-coal/60">
                  {cols.map((c) => <td key={c.key} className="max-w-[18rem] truncate px-4 py-2.5 text-white/90" title={typeof r[c.key] === 'string' ? (r[c.key] as string) : undefined}>{display(r[c.key])}</td>)}
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {p.rowActions?.(r, reload)}
                    {p.canEdit !== false && <button type="button" className="ml-3 font-semibold text-gold hover:text-gold-soft" onClick={() => setEditing({ row: r, isNew: false })}>Edit</button>}
                    {p.canDelete !== false &&
                      (confirmDelete === r[pk] ? (
                        <>
                          <button type="button" className="ml-3 font-semibold text-red-400" onClick={() => void remove(r[pk])}>Confirm</button>
                          <button type="button" className="ml-3 text-muted" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <button type="button" className="ml-3 text-red-400 hover:text-red-300" onClick={() => setConfirmDelete(r[pk])}>Delete</button>
                      ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>{count} record{count === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-outline !px-3 !py-1.5" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="btn-outline !px-3 !py-1.5" disabled={page + 1 >= pages} onClick={() => setPage((x) => x + 1)}>Next</button>
        </div>
      </div>

      {editing && <EditDialog fields={fields} initial={editing.row} isNew={editing.isNew} title={p.title} onCancel={() => setEditing(null)} onSave={save} />}
    </>
  );
}

function EditDialog({ fields, initial, isNew, title, onCancel, onSave }: { fields: Field[]; initial: Row; isNew: boolean; title: string; onCancel: () => void; onSave: (row: Row, isNew: boolean) => Promise<void> }) {
  const [form, setForm] = useState<Row>(() => {
    const f: Row = { ...initial };
    for (const fld of fields) if (fld.type === 'json' && typeof f[fld.key] !== 'string') f[fld.key] = JSON.stringify(f[fld.key] ?? {}, null, 2);
    return f;
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`${isNew ? 'New' : 'Edit'} ${title}`}>
      <form
        className="card max-h-[90dvh] w-full max-w-xl overflow-y-auto"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave(form, isNew);
          setBusy(false);
        }}
      >
        <h2 className="mb-4 text-lg font-bold text-white">{isNew ? 'New record' : 'Edit record'}</h2>
        <div className="space-y-4">
          {fields.map((f) => {
            const disabled = f.readOnly || (!isNew && f.createOnly);
            const id = `f-${f.key}`;
            const v = form[f.key];
            return (
              <div key={f.key}>
                <label htmlFor={id} className="mb-1 block text-sm text-white">
                  {f.label} {f.required && <span className="text-gold">*</span>}
                </label>
                {f.type === 'boolean' ? (
                  <input id={id} type="checkbox" className="h-5 w-5 accent-[#D7AE55]" checked={!!v} disabled={disabled} onChange={(e) => set(f.key, e.target.checked)} />
                ) : f.type === 'select' ? (
                  <select id={id} className="input" value={String(v ?? '')} disabled={disabled} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="" disabled>Select…</option>
                    {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' || f.type === 'json' ? (
                  <textarea id={id} className={`input min-h-[6rem] ${f.type === 'json' ? 'font-mono text-xs' : ''}`} value={String(v ?? '')} disabled={disabled} maxLength={f.maxLength ?? 2000} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <input
                    id={id}
                    className="input"
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                    value={String(v ?? '')}
                    disabled={disabled}
                    maxLength={f.maxLength ?? 500}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-gold" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
