# ==========================================
# SNIFER UPLOADER PORTABLE (Windows)
# No requiere instalación.
# ==========================================

# Configuración
$API_URL = "https://snifer.vercel.app/api/ingest"
$BAUD_RATE = 115200

# Limpiar pantalla
Clear-Host
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   SNIFER UPLOADER PRO (Portable)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Cargar ensamblado de puertos seriales (necesario en algunas versiones)
Add-Type -AssemblyName System.IO.Ports

# 1. Detectar Puertos
Write-Host "`n[1] Buscando puertos seriales..."
$ports = [System.IO.Ports.SerialPort]::GetPortNames()

if ($ports.Count -eq 0) {
    Write-Host "❌ No se encontraron puertos COM." -ForegroundColor Red
    Write-Host "Conecta el Snifer y presiona ENTER para salir..."
    Read-Host
    Exit
}

# 2. Listar Puertos
$i = 1
foreach ($p in $ports) {
    Write-Host "   [$i] $p" -ForegroundColor Yellow
    $i++
}

# 3. Seleccionar
$selection = Read-Host "`nElige el numero del puerto"
$index = [int]$selection - 1

if ($index -lt 0 -or $index -ge $ports.Count) {
    Write-Host "❌ Seleccion invalida." -ForegroundColor Red
    Start-Sleep -Seconds 2
    Exit
}

$portName = $ports[$index]

# 4. Conectar
Write-Host "`n[2] Conectando a $portName a $BAUD_RATE baudios..."

try {
    $port = New-Object System.IO.Ports.SerialPort $portName,$BAUD_RATE,None,8,One
    $port.ReadTimeout = 500
    $port.Open()
} catch {
    Write-Host "❌ Error abriendo puerto: $_" -ForegroundColor Red
    Read-Host "Presiona ENTER para salir"
    Exit
}

Write-Host "✅ Conectado! Escuchando datos y subiendo a la nube..." -ForegroundColor Green
Write-Host "(Cierra esta ventana para detener)`n"

$buffer = @()

# 5. Bucle Principal
try {
    while ($true) {
        try {
            # Leer linea (bloqueante con timeout)
            $line = $port.ReadLine()
            $line = $line.Trim()

            if ($line -ne "") {
                # Validar formato simple (CSV con 4+ columnas)
                $parts = $line.Split(",")
                if ($parts.Count -ge 4) {
                    $obj = @{
                        nodo = $parts[0]
                        mac = $parts[1]
                        rssi = $parts[2]
                        fingerprint = $parts[3]
                        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                    }
                    $buffer += $obj
                    
                    Write-Host "Recibido: $line" -ForegroundColor Gray
                    
                    # Subir datos si tenemos 5 o mas
                    if ($buffer.Count -ge 5) {
                        try {
                            $json = $buffer | ConvertTo-Json -Depth 2 -Compress
                            
                            # Invoke-RestMethod para subir
                            $response = Invoke-RestMethod -Uri $API_URL -Method Post -Body $json -ContentType "application/json"
                            
                            Write-Host "☁️ Subido bloque de $($buffer.Count) registros." -ForegroundColor Cyan
                            $buffer = @() # Limpiar buffer
                        } catch {
                            Write-Host "⚠️ Fallo de red al subir: $_" -ForegroundColor Red
                            # No limpiamos buffer para reintentar (opcional, aqui acumulamos)
                        }
                    }
                }
            }
        } catch [System.TimeoutException] {
            # Timeout de lectura es normal si no hay datos, seguimos
            continue 
        } catch {
            Write-Host "Error en bucle: $_" -ForegroundColor Red
        }
    }
} finally {
    if ($port.IsOpen) { $port.Close() }
    Write-Host "Puerto cerrado."
}
