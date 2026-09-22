interface StudentOutcomeChartProps {
  hasSelectedCurso: boolean;
}

export function StudentOutcomeChart({
  hasSelectedCurso,
}: StudentOutcomeChartProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-8 text-[12px] font-semibold text-gray-800">
        Cumplimiento por Student Outcome
      </h2>

      <div className="relative ml-5 h-[190px] border-l border-b border-gray-200">
        <div className="absolute inset-0 flex flex-col justify-between">
          {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0].map(
            (value) => (
              <div
                key={value}
                className="relative w-full border-t border-dashed border-gray-200"
              >
                <span className="absolute -left-5 -top-[5px] text-[9px] text-gray-400">
                  {value}
                </span>
              </div>
            ),
          )}
        </div>

        {hasSelectedCurso && (
          <div className="absolute inset-0 flex items-end justify-around px-4">
            {/* 
              Aquí posteriormente irán los datos
              de SO1 a SO6 provenientes del backend.
            */}
          </div>
        )}

        <div className="absolute -bottom-4 left-0 right-0 flex justify-around">
          {['SO1', 'SO2', 'SO3', 'SO4', 'SO5', 'SO6'].map(
            (so) => (
              <span
                key={so}
                className="text-[9px] text-gray-500"
              >
                {so}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}