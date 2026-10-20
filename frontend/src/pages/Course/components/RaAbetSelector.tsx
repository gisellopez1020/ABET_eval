import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { catalogoRaAbetApi } from '../../../api/catalogo';
import { apiErrorMessage } from '../../../api/errors';
import { RaAbet } from '../../../types';
import { PROGRAMA_DEFAULT } from '../../StudentOutcomes/raAbetDraft';

const MAX_RA_ABET = 10;

interface RaAbetSelectorProps {
  /** Códigos seleccionados. Puede traer valores antiguos que no están en el catálogo. */
  value: string[];
  onChange: (value: string[]) => void;
  programa: string;
  onProgramaChange: (programa: string) => void;
}

/** Checkboxes del catálogo global de RA ABET, agrupados por competencia. */
export function RaAbetSelector({ value, onChange, programa, onProgramaChange }: RaAbetSelectorProps) {
  const [catalogo, setCatalogo] = useState<RaAbet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Un curso selecciona Resultados de Aprendizaje, no Criterios individuales
    catalogoRaAbetApi
      .list({ soloRaiz: true })
      .then(setCatalogo)
      .catch((err) => setError(apiErrorMessage(err, 'No se pudo cargar el catálogo de Student Outcomes.')))
      .finally(() => setLoading(false));
  }, []);

  const programas = useMemo(
    () => [...new Set([PROGRAMA_DEFAULT, ...catalogo.map((ra) => ra.programa), ...(programa ? [programa] : [])])].sort(),
    [catalogo, programa],
  );
  const catalogoPrograma = useMemo(
    () => catalogo.filter((ra) => ra.programa === programa),
    [catalogo, programa],
  );
  const grupos = useMemo(() => {
    const porCompetencia = new Map<string, RaAbet[]>();
    for (const ra of catalogoPrograma) {
      porCompetencia.set(ra.competencia, [...(porCompetencia.get(ra.competencia) ?? []), ra]);
    }
    return [...porCompetencia.entries()];
  }, [catalogoPrograma]);

  // Resultados de otra carrera y valores antiguos se muestran, pero no se pueden seleccionar
  const codigosDisponibles = new Set(catalogoPrograma.map((ra) => ra.codigo));
  const noEnCatalogo = loading ? [] : value.filter((codigo) => !codigosDisponibles.has(codigo));
  const seleccionados = value.filter((codigo) => codigosDisponibles.has(codigo));
  const lleno = seleccionados.length >= MAX_RA_ABET;

  const toggle = (codigo: string) => {
    // Al cambiar la selección se conservan solo códigos del catálogo
    onChange(
      seleccionados.includes(codigo)
        ? seleccionados.filter((c) => c !== codigo)
        : [...seleccionados, codigo]
    );
  };

  if (loading) {
    return <p className="text-sm text-gray-400">Cargando catálogo…</p>;
  }
  if (error) {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="curso-programa" className="mb-2 block text-sm font-medium text-gray-700">Carrera</label>
        <select
          id="curso-programa"
          aria-label="Carrera"
          value={programa}
          onChange={(event) => onProgramaChange(event.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10"
        >
          <option value="">Selecciona una carrera</option>
          {programas.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <p className="text-sm font-medium text-gray-700">Student Outcomes (RA ABET)</p>
      {!programa && <p className="text-sm text-gray-500">Selecciona una carrera para ver sus Student Outcomes.</p>}

      {noEnCatalogo.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">
            Estos resultados no pertenecen a la carrera seleccionada; cambia la carrera o quita estos resultados.
          </p>
          <ul className="mt-1 list-disc pl-4">
            {noEnCatalogo.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      {programa && catalogoPrograma.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-500">
          Esta carrera todavía no tiene Student Outcomes.{' '}
          <Link to="/student-outcomes" className="font-medium text-[#9E0B0F] hover:underline">
            Cárgalos aquí
          </Link>
          .
        </p>
      ) : programa && (
        <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-gray-200 p-3">
          {grupos.map(([competencia, items]) => (
            <fieldset key={competencia}>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                {competencia}
              </legend>
              <div className="space-y-1">
                {items.map((ra) => {
                  const checked = seleccionados.includes(ra.codigo);
                  return (
                    <label
                      key={ra.codigo}
                      className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                        !checked && lleno ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && lleno}
                        onChange={() => toggle(ra.codigo)}
                        className="mt-0.5 accent-[#9E0B0F]"
                      />
                      <span>
                        <span className="font-semibold text-[#9E0B0F]">{ra.codigo}</span>{' '}
                        <span className="text-gray-700">{ra.descripcion}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      {programa && catalogoPrograma.length > 0 && (
        <p className="text-xs text-gray-400">
          {seleccionados.length}/{MAX_RA_ABET} seleccionados
        </p>
      )}
    </div>
  );
}
