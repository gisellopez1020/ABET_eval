import { ButtonHTMLAttributes, ReactNode } from 'react';

interface TableActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant?: 'default' | 'primary' | 'danger';
}

export function TableActionButton({
  children,
  icon,
  variant = 'default',
  className = '',
  ...props
}: TableActionButtonProps) {
  const variantClasses = {
  default:
    'border border-[#ED1D24] bg-[#ED1D24] text-white hover:bg-red-700',
  primary:
    'border border-[#ED1D24] bg-white text-[#ED1D24] hover:bg-red-50',
  danger:
    'border border-[#ED1D24] bg-[#ED1D24] text-white hover:bg-red-700',
};

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="flex items-center justify-center">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
