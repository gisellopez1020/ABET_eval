import apiClient from './client';
import { Estudiante } from '../types';
import { nombreDesdeContentDisposition } from '../utils/descarga';

export interface EstudianteCreate {
  nombre_completo: string;
  codigo_estudiante: string;
  /** Opcional. Si no tiene formato de correo, el estudiante se crea igual sin correo (ver aviso). */
  email?: string | null;
}

/** Solo se cambia lo que se envíe. `email: null` borra el correo. La sección no se edita. */
export interface EstudianteUpdate {
  nombre_completo?: string;
  codigo_estudiante?: string;
  email?: string | null;
}

/** Respuesta del alta manual y de la edición: `aviso` explica qué pasó con un correo no válido. */
export interface EstudianteCreado extends Estudiante {
  aviso?: string | null;
}

export interface ImportacionCSVResultado {
  importados: number;
  errores: string[];
}

export interface VistaPreviaEstudiantes {
  estudiantes: { nombre: string; codigo: string; email?: string | null }[];
  errores: string[];
}

export const estudiantesApi = {
  list: (seccionId: number) =>
    apiClient.get<Estudiante[]>(`/secciones/${seccionId}/estudiantes`).then((r) => r.data),
  create: (seccionId: number, data: EstudianteCreate) =>
    apiClient
      .post<EstudianteCreado>(`/secciones/${seccionId}/estudiantes`, data)
      .then((r) => r.data),
  /** Un correo no válido no bloquea la edición: se conserva el anterior y llega un aviso. */
  update: (id: number, data: EstudianteUpdate) =>
    apiClient.put<EstudianteCreado>(`/estudiantes/${id}`, data).then((r) => r.data),
  /** Acepta CSV o .xlsx: el backend detecta el formato por la extensión o el content_type. */
  importCsv: (seccionId: number, file: File) => {
    const form = new FormData();
    form.append('archivo', file);
    return apiClient
      .post<ImportacionCSVResultado>(`/secciones/${seccionId}/estudiantes/csv`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  /** Lo que importaría importCsv con este archivo (CSV o .xlsx), sin guardar nada. */
  vistaPrevia: (seccionId: number, file: File) => {
    const form = new FormData();
    form.append('archivo', file);
    return apiClient
      .post<VistaPreviaEstudiantes>(`/secciones/${seccionId}/estudiantes/vista-previa`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  /**
   * .xlsx con Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo de las
   * asignaturas del docente, acotado por asignatura y/o sección si se indican.
   */
  exportarExcel: async (filtros: { curso_id?: number; seccion_id?: number } = {}) => {
    const response = await apiClient.get<Blob>('/estudiantes/exportar-excel', {
      params: filtros,
      responseType: 'blob',
    });
    const nombre = nombreDesdeContentDisposition(response.headers['content-disposition'], 'Estudiantes.xlsx');
    return { blob: response.data, nombre };
  },
  delete: (id: number) =>
    apiClient.delete(`/estudiantes/${id}`).then((r) => r.data),
};
