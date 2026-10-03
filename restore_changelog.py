import sys

s = """# Changelog

Todos as alterações relevantes neste projeto são documentadas neste arquivo (append-only).

## [Unreleased] - Em desenvolvimento

## [v1.3.0] — 2026-10-03
### Adicionado
- Login com Google ativado no fluxo de autenticação (link com conta existente via linkWithPopup, preservando UID)
- Registro da ativação do login com Google no histórico de atualizações
- Melhorias na votação pública (exibição e painel de moderação)

### Alterado
- Ajustes de configuração do Firebase e injeção de secrets no GitHub Pages
- Hardening do getter de variáveis de ambiente (compatibilidade com Vite/GitHub Pages)

### Corrigido
- Estabilização pós-migração de login
- Carregamento da página de Atualizações (robustez com estado vazio/carregando)

## [v1.2.0] — 2026-10-03
### Adicionado
- Migração de contas existentes para login com Google (fluxo guiado enquanto logado, mantendo UID)
- Página /migrar-conta com tutorial passo a passo e instrução sobre uso excepcional de email/senha até 31/12/2026
- Suporte a login duplo (Email+Senha + Google) até 31/12/2026
- Registro de aceite de Termos, LGPD e ECA Digital com versionamento
- Preferência/educação para uso de e-mail institucional (sem bloqueio na fase de migração)
- Coleta/validação de Nome e Sobrenome para garantir consistência em chamada/notas/boletins
- Botão "Termos e Políticas" na página inicial para releitura a qualquer momento
- Modo de manutenção ativável (flag Firestore) para validações com calma
- CHANGELOG.md, RELEASE-NOTES-DETALHADOS.md e UPDATE-LOG.md (append-only)

### Alterado
- Tela de login: botões lado a lado (Email+Senha | Google)
- Redirecionamentos pós-login conforme status de migração
- Configuração do Firebase movida para variáveis de ambiente (VITE_*) com fallback para compatibilidade local

### Segurança
- Instruções/workflow para injeção de secrets no GitHub Actions
- Orientação para restrição de API Key (HTTP referrers + APIs mínimas necessárias)

### Documentação
- Logs, changelog e informações de atualização detalhados (append-only)

### Observação
- Nenhum dado acadêmico foi alterado ou movido. Alterações aditivas, compatibilidade total mantida até 31/12/2026
"""

with open('CHANGELOG.md', 'w', encoding='utf-8') as f:
    f.write(s)
print('ok')
