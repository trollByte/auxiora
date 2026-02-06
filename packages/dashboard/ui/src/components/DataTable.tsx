interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: string;
  actions?: (row: T) => React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({ columns, rows, keyField, actions }: DataTableProps<T>) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => <th key={col.key}>{col.label}</th>)}
          {actions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="empty-row">No data</td></tr>
        ) : (
          rows.map((row) => (
            <tr key={row[keyField]}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</td>
              ))}
              {actions && <td className="actions-cell">{actions(row)}</td>}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
