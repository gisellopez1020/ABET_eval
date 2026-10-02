# ============================================================
# Medición de rendimiento de ABET Eval contra Docker Desktop
# Reproduce las filas de la Tabla 21 (Métricas de rendimiento)
# ============================================================

$Base = "http://localhost:8000"

function Medir($Nombre, $Bloque) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $resultado = & $Bloque
    $sw.Stop()
    Write-Host ("{0,-45} {1,8:N3} s" -f $Nombre, $sw.Elapsed.TotalSeconds)
    return $resultado
}

Write-Host "`n=== 1. Preparando datos de prueba ===`n"

$curso = Invoke-RestMethod -Uri "$Base/cursos" -Method Post -ContentType "application/json" `
    -Body (@{ nombre = "Prueba de rendimiento"; codigo = "PERF-PS"; periodo = "2026-1" } | ConvertTo-Json)

$seccion = Invoke-RestMethod -Uri "$Base/cursos/$($curso.id)/secciones" -Method Post -ContentType "application/json" `
    -Body (@{ nombre = "Grupo PERF" } | ConvertTo-Json)

$actividad = Invoke-RestMethod -Uri "$Base/cursos/$($curso.id)/actividades" -Method Post -ContentType "application/json" `
    -Body (@{ nombre = "Actividad PERF"; tipo = "individual"; peso_nota_final = 100.0 } | ConvertTo-Json)

$rubrica = Invoke-RestMethod -Uri "$Base/actividades/$($actividad.id)/criterios" -Method Put -ContentType "application/json" `
    -Body (@{ aspectos = @(@{ nombre = "A1"; criterios = @(@{ texto = "c1"; peso_porcentaje = 100 }) }) } | ConvertTo-Json -Depth 5)

$criterioId = $rubrica.aspectos[0].criterios[0].id

$estudiante = Invoke-RestMethod -Uri "$Base/secciones/$($seccion.id)/estudiantes" -Method Post -ContentType "application/json" `
    -Body (@{ nombre_completo = "Ana Prueba"; codigo_estudiante = "0001" } | ConvertTo-Json)

Write-Host "Curso $($curso.id), Sección $($seccion.id), Actividad $($actividad.id) listos.`n"

Write-Host "=== 2. Midiendo las operaciones ===`n"

# --- Importar 200 estudiantes (CSV; el endpoint acepta CSV o Excel) ---
$csvPath = "$env:TEMP\perf_200_estudiantes.csv"
"Nombre,Codigo" | Out-File -FilePath $csvPath -Encoding utf8
1..200 | ForEach-Object { "Estudiante $_,2026$(100000 + $_)" | Out-File -FilePath $csvPath -Append -Encoding utf8 }

Medir "Importar 200 estudiantes (CSV)" {
    Invoke-RestMethod -Uri "$Base/secciones/$($seccion.id)/estudiantes/csv" -Method Post `
        -Form @{ archivo = Get-Item $csvPath }
} | Out-Null

# --- Importar 10 criterios (requiere Excel real: se genera con COM) ---
$actividad2 = Invoke-RestMethod -Uri "$Base/cursos/$($curso.id)/actividades" -Method Post -ContentType "application/json" `
    -Body (@{ nombre = "Actividad PERF 2"; tipo = "individual"; peso_nota_final = 100.0 } | ConvertTo-Json)

$xlsxPath = "$env:TEMP\perf_10_criterios.xlsx"
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $libro = $excel.Workbooks.Add()
    $hoja = $libro.Worksheets.Item(1)
    $hoja.Cells.Item(1,1) = "Aspecto"; $hoja.Cells.Item(1,2) = "Criterio"; $hoja.Cells.Item(1,3) = "%Criterio"
    for ($i = 0; $i -lt 10; $i++) {
        $hoja.Cells.Item($i+2,1) = "Aspecto de prueba"
        $hoja.Cells.Item($i+2,2) = "Criterio $i"
        $hoja.Cells.Item($i+2,3) = 10
    }
    $libro.SaveAs($xlsxPath, 51)  # 51 = xlOpenXMLWorkbook (.xlsx)
    $libro.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

    Medir "Importar 10 criterios (Excel)" {
        Invoke-RestMethod -Uri "$Base/actividades/$($actividad2.id)/criterios/importar-excel" -Method Post `
            -Form @{ archivo = Get-Item $xlsxPath }
    } | Out-Null
} catch {
    Write-Host "Importar 10 criterios (Excel)              -- omitido: Excel no está instalado o no se pudo generar el archivo"
}

# --- Calificación de un criterio ---
Medir "Calificación de un criterio" {
    Invoke-RestMethod -Uri "$Base/calificaciones" -Method Post -ContentType "application/json" `
        -Body (@{ actividad_id = $actividad.id; estudiante_id = $estudiante.id;
                  criterios = @(@{ criterio_id = $criterioId; valor = 1 }) } | ConvertTo-Json -Depth 5)
} | Out-Null

# --- Generación del reporte ABET ---
Medir "Generación reporte ABET" {
    Invoke-RestMethod -Uri "$Base/reportes/abet/$($curso.id)" -Method Get
} | Out-Null

# --- Petición autenticada (SKIP_AUTH) ---
Medir "Petición autenticada (SKIP_AUTH)" {
    Invoke-RestMethod -Uri "$Base/cursos" -Method Get
} | Out-Null

Write-Host "`n=== Medición finalizada. ===`n"
Write-Host "Nota: 'Exportación PDF del reporte' se genera en el navegador (jsPDF),"
Write-Host "este script no la mide -- usa las herramientas de desarrollador del navegador."
