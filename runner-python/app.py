import hmac
import os
import subprocess
import sys
import tempfile

from flask import Flask, jsonify, request

if os.name == "posix":
    import resource

app = Flask(__name__)

TOKEN = os.environ.get("RUNNER_TOKEN", "")
PYTHON_BIN = os.environ.get("PYTHON_BIN", sys.executable)
MAX_CODIGO = 20000
MAX_SAIDA = 10000
TEMPO_LIMITE = 5
MEMORIA_MB = 256
TAMANHO_ARQUIVO_MB = 1


def limitar_recursos():
    limite_memoria = MEMORIA_MB * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (limite_memoria, limite_memoria))
    resource.setrlimit(resource.RLIMIT_CPU, (TEMPO_LIMITE, TEMPO_LIMITE))
    tamanho = TAMANHO_ARQUIVO_MB * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_FSIZE, (tamanho, tamanho))


@app.get("/health")
def health():
    return jsonify(ok=True)


@app.post("/run")
def run():
    token = request.headers.get("X-Runner-Token", "")
    if not TOKEN or not hmac.compare_digest(token, TOKEN):
        return jsonify(erro="Não autorizado."), 401

    dados = request.get_json(silent=True) or {}
    codigo = str(dados.get("codigo", ""))
    entrada = str(dados.get("entrada", ""))

    if len(codigo) > MAX_CODIGO:
        return jsonify(erro="Código muito grande."), 413

    with tempfile.TemporaryDirectory() as pasta:
        caminho = os.path.join(pasta, "main.py")
        with open(caminho, "w", encoding="utf-8") as arquivo:
            arquivo.write(codigo)

        kwargs = {}
        if os.name == "posix":
            kwargs["preexec_fn"] = limitar_recursos

        try:
            processo = subprocess.run(
                [PYTHON_BIN, "-I", caminho],
                input=entrada.encode("utf-8"),
                capture_output=True,
                timeout=TEMPO_LIMITE,
                cwd=pasta,
                env={"PYTHONIOENCODING": "utf-8"},
                **kwargs,
            )
        except subprocess.TimeoutExpired as expirou:
            saida = (expirou.stdout or b"").decode("utf-8", "replace")[:MAX_SAIDA]
            return jsonify(saida=saida, erro=f"Tempo limite excedido ({TEMPO_LIMITE} s).", codigo=None, timeout=True)
        except OSError as falha:
            app.logger.exception("Falha ao executar o código")
            return jsonify(saida="", erro=f"Falha interna ao executar: {falha.strerror}", codigo=None, timeout=False), 500

        saida = processo.stdout.decode("utf-8", "replace")[:MAX_SAIDA]
        erro = processo.stderr.decode("utf-8", "replace")[:MAX_SAIDA]
        return jsonify(saida=saida, erro=erro, codigo=processo.returncode, timeout=False)
