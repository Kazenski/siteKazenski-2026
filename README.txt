================================================================================
PROJETO: SITE PROF. KAZENSKI 2026
================================================================================

DESCRIÇÃO:
Plataforma educacional e portfólio para o Prof. Kazenski, focada em cursos, 
projetos e gestão avançada escolar e de permissões para diferentes perfis de 
utilizadores (Visitantes, Alunos, Moderadores, Professores, Coordenação e Admin).

ESTRUTURA DE DIRETÓRIOS E FICHEIROS:

/ (Raiz)
├── index.html              # Estrutura principal do site (SPA - Single Page Application)
├── style.css               # Estilizações globais e customizações adicionais do Tailwind
├── README.txt              # Documentação da estrutura do projeto
│
├── js/                     # Lógica de programação (JavaScript)
│   ├── main.js             # Gerenciador central, roteamento de abas e autenticação
│   │
│   ├── core/               # Núcleo de funcionalidades do sistema
│   │   ├── firebase.js     # Configuração e inicialização do Firebase (Auth/Firestore/RTDB)
│   │   ├── utils.js        # Funções utilitárias partilhadas
│   │   └── validacao.js    # Validações globais (ex: filtro de palavras bloqueadas)
│   │
│   ├── inicio/             # Módulo da aba "Início"
│   │   └── inicio.js       # Renderizador de conteúdo da página inicial
│   │
│   ├── conteudos/          # Módulo da aba "Conteúdos"
│   │   └── conteudosAula.js# Acervo académico, músicas (player de áudio) e podcasts
│   │
│   ├── projetos/           # Módulo da aba "Projetos"
│   │   └── projetos.js     # Galeria e detalhes dos projetos em destaque
│   │
│   ├── atualizacoes/       # Módulo da aba "Atualizações"
│   │   └── atualizacoes.js # Mural de avisos e novidades da plataforma
│   │
│   ├── conexaoAluno/       # Módulo da aba "Conexão Aluno" (Oculta/Desativada)
│   │   └── conexaoAluno.js # Rede social, publicações e interação da comunidade
│   │
│   ├── alunoTech/          # Módulo da aba "Aluno Tech" (Área do Aluno)
│   │   └── perfilTech.js   # Dashboard do aluno (notas, caderno digital, kanban, calendário)
│   │
│   ├── moderadorTech/      # Módulo da aba "Moderador Tech"
│   │   └── cadastroTitulos.js # Gestão de atualizações, títulos, condecorações e aprovação de posts
│   │
│   └── professorTech/      # Módulo da aba "Professor Tech" (Gestão Escolar)
│       └── professorTech.js# Dashboard docente (chamada, notas, pontos extras, relatórios, avaliações)
│
└── imagens/                # Recursos visuais do projeto
    ├── background/
    │   └── background-oficial.jpg  # Imagem de fundo principal
    └── favicon/
        └── faviconKazenski.png     # Ícone do site


TECNOLOGIAS UTILIZADAS:
- HTML5 / CSS3 (Tailwind CSS via CDN)
- JavaScript (ES6 Modules)
- Firebase 10.8.1 (Authentication, Firestore Database, Realtime Database)
- Chart.js (Gráficos analíticos)
- jsPDF (Exportação de relatórios em PDF)
- Cropper.js (Edição de imagens)
- FontAwesome (Ícones)
- Google Fonts (Cinzel & Inter)

SISTEMA DE PERMISSÕES (MENU_ARCHITECTURE):
O sistema (main.js) reconstrói o menu e o acesso dinamicamente com base nos papéis (roles) definidos no Firebase:
- Início / Conteúdos / Projetos / Atualizações: Público (Acessível a Visitantes e Autenticados).
- Conexão Aluno: Oculta do menu principal.
- Aluno Tech: Alunos, Moderadores, Professores, Coordenação e Admins.
- Moderador Tech: Moderadores, Professores, Coordenação e Admins.
- Professor Tech: Professores, Coordenação e Admins.
- Admin Tech: Acesso exclusivo a Administradores.

NOTAS DE DESENVOLVIMENTO:
- O projeto funciona como uma Single Page Application (SPA). O ficheiro 'main.js' 
  reconstrói as abas e destrói visualizações não autorizadas com base no login.
- Existe um gestor de sessão via Realtime Database que expira a ligação do utilizador
  após 15 minutos de inatividade para garantir segurança.
================================================================================
