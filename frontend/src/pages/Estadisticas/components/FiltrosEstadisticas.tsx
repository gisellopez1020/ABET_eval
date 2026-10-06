import { Actividad, Curso, Seccion } from '../../../types';

const SELECT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#9E0B0F] focus:ring-2 focus:ring-[#9E0B0F]/10 disabled:bg-gray-50 disabled:text-gray-400';

interface FiltrosEstadisticasProps {
  cursos: Curso[];
  secciones: Seccion[];
  actividades: Actividad[];
  cursoId: number | null;
  seccionId: number | '';
  actividadId: number | '';
  loadingCursos: boolean;
  onCurso: (value: string) => void;
  onSeccion: (seccionId: number | '') => void;
  onActividad: (actividadId: number | '') => void;
}

// Selectores en cascada: Asignatura -> Sección / Actividad
export function FiltrosEstadisticas({
  cursos,
  secciones,
  actividades,
  cursoId,
  seccionId,
  actividadId,
  loadingCursos,
  onCurso,
  onSeccion,
  onActividad,
}: FiltrosEstadisticasProps) {
  return (
    <div className="mb-5 grid gap-4 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-3">
      <label className="block text-sm font-medium text-gray-700">
        <span className="mb-2 block">Asignatura</span>
        <select
          value={cursoId ?? ''}
          onChange={(e) => onCurso(e.target.value)}
          style={{ accentColor: '#9E0B0F' }}
          className={SELECT_CLASS}
          disabled={loadingCursos}
        >
          <option value="">{loadingCursos ? 'Cargando asignaturas…' : 'Selecciona una asignatura'}</option>
          {cursos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.codigo} · {c.periodo})
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-gray-700">
        <span className="mb-2 block">Sección</span>
        <select
          value={seccionId}
          onChange={(e) => onSeccion(e.target.value ? Number(e.target.value) : '')}
          className={SELECT_CLASS}
          disabled={!cursoId}
        >
          <option value="">Todas las secciones</option>
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-gray-700">
        <span className="mb-2 block">Actividad</span>
        <select
          value={actividadId}
          onChange={(e) => onActividad(e.target.value ? Number(e.target.value) : '')}
          className={SELECT_CLASS}
          disabled={!cursoId}
        >
          <option value="">Todas las actividades</option>
          {actividades.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre} ({a.tipo === 'grupal' ? 'grupal' : 'individual'})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
