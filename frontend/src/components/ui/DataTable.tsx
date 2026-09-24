import { ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string | number;
  empty?: ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  empty,
  className = '',
}: DataTableProps<T>) {
  return (
    <div className={`overflow-hidden rounded-xl border border-[#ED1D24]/50 bg-white shadow-sm ${className}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead className="bg-[#fafafa]">
            <tr className="border-b border-[#9E0B0F]/20 text-sm text-[#9E0B0F]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 font-semibold ${
                    column.align === 'center'
                      ? 'text-center'
                      : column.align === 'right'
                        ? 'text-right'
                        : 'text-left'
                  } ${column.className ?? ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.length > 0 ? (
              data.map((row) => (
                <tr
                  key={String(getRowKey(row))}
                  className="border-b border-[#9E0B0F]/10 text-sm text-gray-700 last:border-b-0 hover:bg-[#9E0B0F]/[0.03]"
                >
                  {columns.map((column) => (
                    <td
                      key={`${String(getRowKey(row))}-${column.key}`}
                      className={`px-4 py-3 ${
                        column.align === 'center'
                          ? 'text-center'
                          : column.align === 'right'
                            ? 'text-right'
                            : 'text-left'
                      } ${column.className ?? ''}`}
                    >
                      {column.render
                        ? column.render(row)
                        : ((row as Record<string, unknown>)[column.key] as ReactNode) ?? ''}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-gray-500">
                  {empty ?? 'No se encontraron resultados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
