type SyncState = 'sincronizado' | 'sincronizando' | 'error';

interface SyncStatusProps {
  estado: SyncState;
}

const config: Record<SyncState, { label: string; color: string; icon: string }> = {
  sincronizado: {
    label: 'Sincronizado',
    color: 'bg-green-100 text-green-700',
    icon: '✓',
  },
  sincronizando: {
    label: 'Sincronizando…',
    color: 'bg-blue-100 text-blue-700',
    icon: '↻',
  },
  error: {
    label: 'Error de sync',
    color: 'bg-red-100 text-red-700',
    icon: '✗',
  },
};

export function SyncStatus({ estado }: SyncStatusProps) {
  const { label, color, icon } = config[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      <span className={estado === 'sincronizando' ? 'animate-spin inline-block' : ''}>{icon}</span>
      {label}
    </span>
  );
}
