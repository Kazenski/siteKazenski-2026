# Base de Conhecimento BNCC — Kaz IA

Esta pasta é o lugar recomendado para hospedar os PDFs pesados da **BNCC** e da
**BNCC Digital de SC**, sem depender do limite de 1MB por documento do Firestore.

## Como funciona

1. Coloque os arquivos PDF nesta pasta (`docs/bncc/`), ex:
   - `docs/bncc/BNCC-Ensino-Medio.pdf`
   - `docs/bncc/BNCC-Digital-SC.pdf`
2. Faça commit e push para o GitHub.
3. Pegue a URL **raw** de cada arquivo:
   - Abra o arquivo no GitHub → clique em **Raw** → copie a URL.
   - Formato: `https://raw.githubusercontent.com/SEU-USUARIO/SEU-REPO/main/docs/bncc/NOME-DO-ARQUIVO.pdf`
4. No site, vá em **Professor Tech → Gerar Plano com Kaz IA → Fontes (RAG)**:
   - Preencha o título (ex: "BNCC Ensino Médio - Tecnologia")
   - Troque o tipo para **"Link público (ex: PDF no GitHub — sem limite)"**
   - Cole a URL raw e clique em **Salvar Fonte**
5. Ao gerar um plano, a Cloud Function baixa o PDF no servidor e envia para o
   Gemini junto com o prompt — o arquivo pode ter qualquer tamanho no GitHub
   (o trecho enviado por fonte é limitado a ~4MB).

## Alternativas

- **Texto colado**: para trechos curtos, use o tipo "Texto colado" direto no
  modal de Fontes, sem precisar de arquivo.
- **PDF anexado**: só para arquivos de até 1MB (limite do Firestore).

## Arquivos nesta pasta

| Arquivo | Descrição |
|---------|-----------|
| _(adicione seus PDFs aqui)_ | Ex: BNCC, BNCC Digital SC, diretrizes da escola |
