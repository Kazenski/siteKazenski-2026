# Log de Atualizações Detalhado

## 2026-10-03 – Fase 1: Migração para Login com Google + Segurança

### Objetivo
Preservar todos os dados existentes dos alunos (notas, turmas, histórico) ao implementar login com Google, mantendo o menor risco possível e educando os usuários durante a transição.

### Implementações

#### 1. Migração de contas (sem perda de dados)
- Fluxo **"link enquanto logado"**: o aluno entra primeiro com sua conta (email+senha) cadastrada e, na página de migração guiada, vincula sua conta Google. Isso mantém o **UID inalterado** e todos os documentos/dados intactos.
- Transição híbrida: **Login duplo (Email+Senha + Google)** mantido até **31/12/2026**.
- Novos alunos: **apenas Google** (a partir do encerramento/definição da campanha).
- Guardas: bloqueio de login Google direto para contas ainda não migradas (evita criação acidental de UID novo). Suporte a login direto com Google apenas para quem já possui vínculo.

#### 2. Página de Migração ("pegar pela mão")
- Tutorial passo a passo com instruções claras para evitar erros.
- Coleta obrigatória de **Nome e Sobrenome** para garantir consistência em chamada, notas e boletins.
- Educação ao usuário: informado que, **mesmo após migrado**, em casos excepcionais poderá utilizar o email/senha antigo até **31/12/2026**. Após esse prazo, priorizar login com Google para melhor experiência.
- Orientação para preferir **e-mail institucional** (`@estudante.sed.sc.gov.br` / `@profe.sed.sc.gov.br`), sem bloquear outros Gmails durante a fase de migração.

#### 3. Termos, LGPD e ECA Digital
- Páginas dedicadas acessíveis a qualquer momento (botão "Termos e Políticas" na página inicial).
- **Registro de aceite** no Firestore por usuário, com **versionamento** (`termsVersion`, `lgpdVersion`, `ecaVersion`) e data/hora.
- Preparado para exigir/revalidar aceite caso haja nova versão dos documentos.

#### 4. Segurança (Firebase + GitHub Pages)
- Configuração do Firebase movida para **variáveis de ambiente** (`VITE_*`) com **fallback** para manter funcionamento local sem quebra.
- Workflow do GitHub Actions preparado para injetar secrets no build (sem commitar chaves).
- Orientações para **restrição da API Key** por HTTP referrers e por APIs mínimas necessárias.

#### 5. Manutenção, Changelog e Logs
- Modo de manutenção ativável para validações com calma (não expõe alterações inacabadas indevidamente).
- **CHANGELOG.md** e **logs de atualização detalhados** criados em modo **append-only** (nunca sobrescreve histórico anterior).
- Preparação para banner de "Novidades" após deploy.

### Observação Importante
**Nenhum dado acadêmico foi alterado/movido.** O fluxo prioriza manter o UID (link enquanto logado), eliminando risco de duplicação/órfãos. As alterações são **aditivas** e preservam total compatibilidade com o funcionamento atual até 31/12/2026.
