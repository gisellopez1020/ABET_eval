interface RecentActivityProps {
  hasSelectedCurso: boolean;
}

export function RecentActivity({
  hasSelectedCurso,
}: RecentActivityProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <h2 className="mb-3 text-[12px] font-semibold text-gray-800">
        Actividad Reciente
      </h2>

      <p className="text-[10px] text-gray-400">
        {!hasSelectedCurso
          ? 'Ninguna información'
          : 'Ninguna información'}
      </p>
    </section>
  );
}