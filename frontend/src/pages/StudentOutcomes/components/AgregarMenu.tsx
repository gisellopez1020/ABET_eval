import { ChevronDown, Plus } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { Nivel } from '../raAbetDraft';

interface AgregarMenuProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Mientras se agrega una fila nueva */
  disabled: boolean;
  /** Sin Resultados de Aprendizaje no se puede agregar un Criterio */
  sinRaices: boolean;
  onAdd: (nivel: Nivel) => void;
}

// Botón "Agregar" con su menú: Resultado de Aprendizaje o Criterio de Evaluación
export function AgregarMenu({ open, onToggle, onClose, disabled, sinRaices, onAdd }: AgregarMenuProps) {
  return (
              <div className="relative">
                <Button
                  variant="primary"
                  size="md"
                  icon={<Plus size={16} />}
                  onClick={onToggle}
                  disabled={disabled}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  className="rounded-xl bg-[#9E0B0F] hover:bg-[#82090d]"
                >
                  Agregar
                  <ChevronDown size={14} />
                </Button>
                {open && (
                  <>
                    {/* Capa invisible para cerrar el menú al hacer clic fuera */}
                    <div className="fixed inset-0 z-10" onClick={onClose} />
                    <div
                      role="menu"
                      className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onAdd('ra')}
                        className="block w-full px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <span className="block text-sm font-medium text-gray-900">Resultado de Aprendizaje</span>
                        <span className="block text-xs text-gray-500">Nivel superior (P.I.), ej. 2.1</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onAdd('criterio')}
                        disabled={sinRaices}
                        className="block w-full border-t border-gray-100 px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="block text-sm font-medium text-gray-900">Criterio de Evaluación</span>
                        <span className="block text-xs text-gray-500">
                          {sinRaices
                            ? 'Primero crea un Resultado de Aprendizaje'
                            : 'Dentro de un RA, con su peso, ej. 2.1.1'}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
  );
}
