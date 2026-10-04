<#
  check_syntax.ps1
  ----------------
  Valida TODOS os arquivos .js do projeto como ES MODULE (goal "module").

  POR QUE ESTE SCRIPT EXISTE:
  `node --check arquivo.js` detecta "module syntax" em arquivos .js e, nesse
  caso, SAÍDA com exit code 0 SEM NADA VERIFICAR (bug/limitacao do Node 22).
  Todos os arquivos deste projeto usam `import`, entao `node --check` mentia
  e approvei arquivos com erros de sintaxe reales.

  Solucao: copiar para um .mjs temporario (forcado como ESM) e rodar
  `node --check` nele, que de fato valida.
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmpDir = Join-Path $env:TEMP ("kz_syntax_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$files = Get-ChildItem -Path $root -Recurse -Include *.js -File |
    Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.git|tools[\\/]harness|temp|tmp)[\\/]' }

$fail = @()
$ok = 0

foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/')
    $dest = Join-Path $tmpDir "chk.mjs"
    Copy-Item $f.FullName $dest -Force
    # node escreve o erro em stderr; nao deixar o PowerShell tratar como terminating error
    $ErrorActionPreference = 'Continue'
    $out = (& node --check $dest 2>&1 | Out-String)
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) {
        # extrai "linha:col" e a linha com problema do trecho isolado
        $lines = $out -split "`r?`n"
        $msg = ($lines | Where-Object { $_ -match 'SyntaxError' } | Select-Object -First 1)
        $caret = ($lines | Where-Object { $_ -match '^\s*\^+\s*$' } | Select-Object -First 1)
        # localiza a linha do arquivo original a partir do trecho com cursor
        $idx = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '^\s*\^+\s*$' -and $i -gt 0) { $idx = $i - 1; break }
        }
        $origLine = if ($idx -ge 0) { $lines[$idx].Trim() } else { '' }
        $fail += [pscustomobject]@{
            File = $rel
            Msg  = ($msg -replace '\s+', ' ').Trim()
            Code = $origLine
        }
    } else {
        $ok++
    }
}

Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== VERIFICACAO DE SINTAXE (ESM real) ===" -ForegroundColor Cyan
Write-Host "OK:   $ok arquivo(s)"
Write-Host "FAIL: $($fail.Count) arquivo(s)"
Write-Host ""

if ($fail.Count -gt 0) {
    foreach ($f in $fail) {
        Write-Host "[ERRO] $($f.File)" -ForegroundColor Red
        Write-Host "       $($f.Msg)" -ForegroundColor Red
        if ($f.Code) { Write-Host "       > $($f.Code)" -ForegroundColor DarkYellow }
        Write-Host ""
    }
    exit 1
} else {
    Write-Host "Todos os arquivos .js estão sintaticamente válidos." -ForegroundColor Green
    exit 0
}