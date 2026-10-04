param([switch]$SkipNode)
$falhas = 0

function Rodar($nome, $cmd) {
    Write-Output ""
    Write-Output "=== $nome ==="
    & cmd /c $cmd
    $code = $LASTEXITCODE
    if ($code -ne 0) { Write-Output ">>> FALHOU ($code)"; $script:falhas++ }
}

if (-not $SkipNode) {
    Rodar "sintaxe do professorTech" "node --check js/professorTech/professorTech.js"
    Rodar "sintaxe de todos os modulos" "for %f in (js\core\*.js js\main.js js\manutencao\*.js js\aluno\*.js) do @node --check %f"
    Rodar "self-test do lint_colado" "node tools\test_lint_colado.js"
    Rodar "palavra-chave colada" "node tools\lint_colado.js js\professorTech\professorTech.js js\main.js"
}

Rodar "testes de absenteismo" "node tools\test_ausentismo.js"
Rodar "testes de estatisticas (evolucao)" "node tools\test_evolucao.js"

Write-Output ""
Write-Output "=== referencias (els.* e getElementById) ==="
python tools\check_refs.py
if ($LASTEXITCODE -ne 0) { Write-Output ">>> FALHOU"; $falhas++ }

Write-Output ""
Write-Output "=== balanceamento do index.html ==="
python tools\html_balance.py
if ($LASTEXITCODE -ne 0) { Write-Output ">>> FALHOU"; $falhas++ }

Write-Output ""
if ($falhas -gt 0) {
    Write-Output "$falhas VERIFICACAO(OES) COM FALHA"
    exit 1
}
Write-Output "TODAS AS VERIFICACOES PASSARAM"