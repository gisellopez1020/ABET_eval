export interface ProjectOption {
  id: number;
  nombre: string;
  cursoId: number;
  cursoNombre: string;
  actividadId: number;
  actividadNombre: string;
  seccionId: number;
  seccionNombre: string;
  miembros: string[];
  calificado: boolean;
  notaTotal: number | null;
}
