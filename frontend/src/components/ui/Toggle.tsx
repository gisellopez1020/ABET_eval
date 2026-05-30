interface ToggleProps {
  value: 0 | 1;
  onChange: (value: 0 | 1) => void;
  disabled?: boolean;
}

export function Toggle({ value, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(value === 1 ? 0 : 1)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-uao-mid focus:ring-offset-1 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${value === 1 ? 'bg-green-500' : 'bg-gray-300'}`}
      aria-label={value === 1 ? 'Cumple (1)' : 'No cumple (0)'}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          value === 1 ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
