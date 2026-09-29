import { ChevronDown } from 'lucide-react';

import { AppLayout } from '../../components/Layout/AppLayout';

interface SeccionAyuda {
  titulo: string;
  texto: string;
}

const SECCIONES: SeccionAyuda[] = [
  {
    titulo: 'Asignaturas',
    texto:
      'Crea una asignatura con el botón "Nueva asignatura" desde la lista de Asignaturas. El código y el período identifican el curso — puedes tener el mismo curso repetido en distintos períodos (por ejemplo, "Redes de datos" en 2025-2 y en 2026-2), y el sistema los distingue en todos los selectores. La sección "Configuración ABET" del formulario es opcional: ahí eliges los rangos de calificación del curso y los Resultados de Aprendizaje que aplica, o los dejas con los valores por defecto y los completas después. El botón "Eliminar" en realidad cierra la asignatura (no borra sus datos); una asignatura cerrada muestra "Activar" en su lugar.',
  },
  {
    titulo: 'Estudiantes',
    texto:
      'Se agregan por sección, ya sea uno por uno o importando un archivo CSV o Excel (.xlsx) con las columnas Nombre y Código (o Codigo). La pantalla de Estudiantes muestra a todos los de todas tus asignaturas; usa los filtros de Asignatura y Sección para acotar la lista. Al eliminar un estudiante también se borran sus calificaciones individuales y se le retira de los equipos a los que pertenezca — esa acción no se puede deshacer.',
  },
  {
    titulo: 'Rúbrica ABET',
    texto:
      'Cada actividad tiene su propia rúbrica: aspectos que agrupan criterios, y cada criterio con un peso porcentual. Los pesos de todos los criterios de una actividad deben sumar exactamente 100% antes de poder guardar. Puedes construir la rúbrica manualmente con "+ Agregar aspecto", o importarla completa desde un CSV con las columnas Aspecto, Criterio, Peso y, opcionalmente, CodigoABET, o desde un Excel (.xlsx) con las columnas Aspecto, Criterio y %Criterio (el aspecto puede ir en celdas combinadas; el vínculo a Student Outcomes se hace después en la pantalla). Si una actividad ya tiene calificaciones, no se puede editar su estructura (aspectos o criterios) — solo cambiar a qué Student Outcome está vinculado cada aspecto, para no arriesgar las notas ya guardadas.',
  },
  {
    titulo: 'Student Outcomes',
    texto:
      'Es el catálogo de Resultados de Aprendizaje y Criterios de Evaluación de tu programa, compartido entre todas tus asignaturas. Puedes importarlo desde un CSV (columnas Codigo, CodigoPadre, Competencia, Descripcion, Peso) o construirlo a mano. Un código sin CodigoPadre es un Resultado de Aprendizaje; un código con CodigoPadre es un Criterio de Evaluación dentro de ese resultado, con su propio peso. No se puede borrar un código que ya esté en uso por un curso o vinculado en una rúbrica.',
  },
  {
    titulo: 'Proyectos y equipos',
    texto:
      'Para actividades grupales, crea los equipos de trabajo desde esta pantalla antes de poder calificar — elige la asignatura, la actividad y los estudiantes que forman cada equipo. Una actividad individual no necesita equipos: se califica directamente por estudiante.',
  },
  {
    titulo: 'Evaluación',
    texto:
      'Muestra el detalle de la rúbrica de un equipo específico en modo lectura, con el estado de cada criterio (Cumple, No cumple, Sin calificar) y el porcentaje de avance. El botón "Ir a calificar" te lleva a la pantalla donde realmente se asignan las calificaciones.',
  },
  {
    titulo: 'Estadísticas ABET y Reportes',
    texto:
      '"Reportes ABET" (desde el detalle de una asignatura) muestra la distribución de calificaciones agregada de todo el curso, por Criterio de Evaluación y por Resultado de Aprendizaje, exportable a PDF. "Estadísticas ABET" hace lo mismo pero acotado a una actividad específica, y agrega dos exportaciones a Excel: un resumen con la hoja de conteo por rangos, y un detalle con una hoja por equipo o estudiante en el mismo formato que se usa institucionalmente para reportar a ABET. El detalle se sincroniza automáticamente con tu Google Drive.',
  },
];

export function AyudaPage() {
  return (
    <AppLayout>
      <main className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Ayuda</h1>
          <p className="mt-1 text-sm text-gray-500">Guía de uso de cada módulo</p>
        </div>

        {/* <details> nativo: varias secciones abiertas a la vez, accesible por teclado sin estado propio */}
        <div className="max-w-4xl space-y-3">
          {SECCIONES.map((seccion) => (
            <details
              key={seccion.titulo}
              className="group rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 text-[15px] font-semibold text-gray-800 transition hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                {seccion.titulo}
                <ChevronDown
                  size={18}
                  className="shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                />
              </summary>

              <p className="border-t border-gray-100 px-5 py-4 text-sm leading-relaxed text-gray-700">
                {seccion.texto}
              </p>
            </details>
          ))}
        </div>
      </main>
    </AppLayout>
  );
}
