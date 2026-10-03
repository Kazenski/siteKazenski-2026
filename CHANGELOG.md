# Changelog

Todos as alterações relevantes neste projeto são documentadas neste arquivo (append-only).

## [Unreleased] - Em desenvolvimento

## [v1.3.0] — 2026-10-03
### Adicionado
- Migração de contas existentes para login com Google (fluxo "pegar pela mão" enquanto logado, mantendo UID)
- Página `/migrar-conta` com tutorial passo a passo e instrução sobre uso excepcional de email/senha até 31/12/2026
- Suporte a login duplo (Email+Senha + Google) até 31/12/2026
- Registro de aceite de Termos, LGPD e ECA Digital com versionamento
- Preferência/educação para uso de e-mail institucional (sem bloqueio na fase de migração)
- Coleta/validação de Nome e Sobrenome para garantir consistência em chamada/notas/boletins
- Botão "Termos e Políticas" na página inicial para releitura a qualquer momento
- Modo de manutenção ativável (flag Firestore) para validações com calma

### Alterado
- Tela de login: botões lado a lado (Email+Senha | Google)
- Redirecionamentos pós-login conforme status de migração
- Configuração do Firebase movida para variáveis de ambiente (VITE_*) com fallback para compatibilidade local

### Segurança
- Instruções/workflow para injeção de secrets no GitHub Actions
- Orientação para restrição de API Key (HTTP referrers + APIs mínimas necessárias)

### Documentação
- Logs, changelog e informações de atualização detalhados (append-only)