// Mismo patrón que RubricaPage: letra del aspecto + posición del criterio dentro de él (A.1, A.2, B.1)
export const letraAspecto = (aspectoIndex: number) => String.fromCharCode(65 + aspectoIndex);
export const codigoCriterio = (aspectoIndex: number, criterioIndex: number) =>
  `${letraAspecto(aspectoIndex)}.${criterioIndex + 1}`;

// Anillo de avance del resumen del equipo
export const RADIO_ANILLO = 46;
export const CIRCUNFERENCIA = 2 * Math.PI * RADIO_ANILLO;
