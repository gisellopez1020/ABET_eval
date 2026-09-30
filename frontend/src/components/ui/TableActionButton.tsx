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
    'bg-white text-black border border-[#E73426] hover:bg-[#EAEAEA] hover:border-[#9E0B0F]',

  primary:
    'bg-[#E73426] text-white border border-[#E73426] hover:bg-[#9E0B0F] hover:border-[#9E0B0F]',

  danger:
    'border border-[#ED1D24] bg-[#ED1D24] text-white hover:bg-[#C9181E] hover:border-[#C9181E]',
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
