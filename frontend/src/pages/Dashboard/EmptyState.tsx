interface EmptyStateProps {
  message?: string;
}

export function EmptyState({
  message = 'Seleccione una materia para visualizar la información.',
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[250px] items-center justify-center">
      <p className="text-sm text-gray-400">
        {message}
      </p>
    </div>
  );
}