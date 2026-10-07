interface ResumenRubricaProps {
  totalAspectos: number;
  totalCriterios: number;
  totalPeso: number;
}

// Recuadro "Resumen": aspectos, criterios y peso total del borrador
export function ResumenRubrica({ totalAspectos, totalCriterios, totalPeso }: ResumenRubricaProps) {
  return (
          <div className="mb-5 overflow-hidden rounded-[20px] bg-[#9E0B0F] p-5 text-white shadow-sm">
            <div className="mb-2 text-sm uppercase tracking-[0.14em] text-red-100">Resumen</div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Aspectos</div>
                <div className="mt-2 text-3xl font-bold">{totalAspectos}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Criterios</div>
                <div className="mt-2 text-3xl font-bold">{totalCriterios}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-red-100">Peso total</div>
                <div className="mt-2 text-3xl font-bold">{totalPeso}%</div>
              </div>
            </div>
          </div>
  );
}
