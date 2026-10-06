# Kaz IA - Guia de Configuração

## Visão Geral

A Kaz IA foi reestruturada para usar **Firebase Cloud Functions**, o que traz:

- **Segurança**: A chave da API do Gemini fica no servidor (nunca exposta no navegador)
- **Modelos atualizados**: Gemini 2.0 Flash, 2.5 Flash e 1.5 Pro
- **Prompt otimizado**: Instruções específicas para BNCC e BNCC Digital de SC
- **Melhor tratamento de erros**: Mensagens claras para o usuário
- **Saída em formato textual**: Copie e cole diretamente no modelo da sua escola
- **Modelos de planejamento**: Salve e reutilize os modelos de cada escola
- **Histórico inteligente**: A IA consulta planos existentes antes de gerar novos

## Passo a Passo para Configurar

### 1. Obter uma chave de autenticação do Gemini (dedicada)

A `Gemini API` **não aceita chaves de API padrão compartilhadas**: o Google exige
uma credencial separada vinculada a uma conta de serviço. Não mexa na sua chave
atual — crie uma nova:

1. Acesse o Google Cloud Console no **projeto da chave** (ex: `kazenski`)
2. Vá em **APIs e serviços → Biblioteca**, busque **Gemini API** e clique em **Ativar**
3. Vá em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**
4. Conclua a **vinculação a uma conta de serviço** (o console oferece essa opção
   ao selecionar a Gemini API — use a conta padrão do projeto)
5. Copie o valor da nova chave (ela é usada **só no servidor**, nunca no navegador)

### 2. Configurar a Chave no Firebase

Abra o terminal na pasta do projeto e execute:

```bash
# Login no Firebase (se ainda não estiver logado)
firebase login

# Selecione o projeto
firebase use --add

# Configure a chave como Secret
firebase functions:secrets:set GEMINI_API_KEY
```

Quando solicitado, cole a chave que você copiou no passo 1.

### 2b. Configurar o token do GitHub (para o botão "Registrar no GitHub")

O botão publica os PDFs em `docs/bncc/` do repositório via API, com o token
guardado só no servidor:

1. No GitHub, acesse **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens** e gere um token com permissão **Contents: Read and write**
   apenas no repositório do site
2. No terminal, na pasta do projeto:
```bash
firebase.cmd functions:secrets:set GITHUB_TOKEN
```
3. Cole o token quando solicitado
4. No site, no modal de Fontes, abra **Configuração do GitHub** e preencha
   Owner, Repositório e Branch (ficam salvos no navegador)

### 3. Fazer Deploy da Cloud Function

```bash
# Deploy apenas das functions
firebase deploy --only functions
```

### 4. Testar

1. Acesse o site
2. Vá em **Professor Tech** → **Gerar Plano com Kaz IA**
3. Selecione Turma e Disciplina
4. Escolha o modelo de IA (recomendado: **Gemini 2.5 Flash**)
5. Preencha o assunto central
6. Clique em **Gerar Plano com Inteligência Artificial**

## Como Adicionar os PDFs da BNCC

1. Na aba Kaz IA, clique em **Fontes (RAG)**
2. Clique em **"Anexar PDF da Base"**
3. Selecione o PDF da BNCC ou BNCC Digital de SC
4. Dê um título descritivo (ex: "BNCC Ensino Médio - Tecnologia")
5. Clique em **Salvar Base em PDF**

**Importante**: Os PDFs são armazenados no Firestore. O limite por documento é de **1MB**. Se o PDF for maior, extraia apenas as páginas relevantes.

## Como Salvar e Reutilizar Modelos de Planejamento

### Salvar um modelo

1. Na aba Kaz IA, clique em **Modelos**
2. Cole o modelo de planejamento da sua escola no campo indicado
3. Clique em **Salvar Modelo**
4. Dê um nome descritivo (ex: "Modelo Escola X - Plano Diário")

### Usar um modelo salvo

1. Na aba Kaz IA, clique em **Modelos**
2. Clique no ícone de edição ao lado do modelo desejado
3. O modelo será carregado no campo "Modelo de Planejamento da Escola"
4. Gere o plano normalmente - a IA adaptará a saída ao modelo

## Como Funciona o Histórico Inteligente

A Kaz IA agora consulta automaticamente os planos existentes da mesma disciplina antes de gerar novos. Isso permite:

- **Evitar repetição**: A IA sabe o que já foi abordado
- **Manter progressão**: Os planos seguem uma sequência lógica
- **Evolução contínua**: Cada plano novo se baseia nos anteriores

### Visualizar planos existentes

1. Na aba Kaz IA, clique em **Meus Planos**
2. A lista mostra todos os planos gerados, organizados por data
3. Use os filtros de escola, turma, disciplina e trimestre para encontrar planos específicos
4. Clique em **Ver Plano** para visualizar o conteúdo completo

## Modelos de IA Disponíveis

| Modelo | Descrição | Quando usar |
|--------|-----------|-------------|
| **Gemini 2.0 Flash** | Rápido e econômico | Planos simples, testes rápidos |
| **Gemini 2.5 Flash** | Replanado e equilibrado | **Uso geral (recomendado)** |
| **Gemini 1.5 Pro** | Mais detalhado e complejo | Planos anuais, temas complexos |

## Solução de Problemas

### Erro: "Usuário não autenticado"
- Faça login novamente no site
- Verifique se sua conta está ativa

### Erro: "Cota de uso excedida"
- Atingiu o limite gratuito da API do Gemini
- Aguarde alguns minutos e tente novamente
- Considere upgrade para uma conta paga no Google AI Studio

### Erro: "Sem permissão para usar a Kaz IA"
- Verifique se você tem permissão de Professor ou Admin
- Contate o administrador do sistema

### A IA não gera conteúdo válido
- Verifique se há PDFs cadastrados na base de conhecimento
- Tente reformular o assunto central
- Tente outro modelo de IA

### O plano gerado não cita a BNCC
- Verifique se os PDFs da BNCC estão cadastrados
- O prompt já instrui a IA a citar códigos BNCC, mas a qualidade depende do modelo e dos PDFs

## Estrutura de Arquivos

```
siteKazenski-2026/
├── functions/
│   ├── index.js          # Cloud Functions (inclui gerarPlanoIA, salvarPlano, etc.)
│   └── package.json      # Dependências
├── js/
│   └── professorTech/
│       └── professorTech.js  # Lógica frontend da Kaz IA
├── index.html            # Interface da aba Kaz IA
└── KAZ_IA_SETUP.md       # Este arquivo
```

## Coleções do Firestore

| Coleção | Descrição |
|---------|-----------|
| `base_pedagogica` | PDFs da BNCC e diretrizes (base64, título, tipo) |
| `planos_aula_ia` | Planos gerados pela IA (texto, metadados, professorUid) |
| `modelos_planejamento` | Modelos de planejamento das escolas |

## Próximos Passos Sugeridos

1. **Upload dos PDFs da BNCC**: Cadastre os documentos na base de conhecimento
2. **Salvar modelos de planejamento**: Cadastre os modelos de cada escola
3. **Teste com diferentes modelos**: Compare a qualidade dos planos gerados
4. **Ajuste do prompt**: Se necessário, personalize o prompt em `functions/index.js`
5. **Implementar streaming**: Para mostrar o texto sendo gerado em tempo real
6. **Cache de respostas**: Para evitar chamadas repetidas à API

## Suporte

Se encontrar problemas, verifique:
1. O console do navegador (F12) para erros detalhados
2. O painel do Firebase → Functions → Logs
3. Se a chave da API está configurada corretamente

---

**Última atualização**: 2026-10-06
