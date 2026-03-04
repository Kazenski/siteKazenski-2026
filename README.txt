================================================================================
PROJETO: SITE PROF. KAZENSKI 2026
================================================================================

DESCRIÇÃO:
Plataforma educacional e portfólio para o Prof. Kazenski, focada em cursos, 
projetos e gestão de permissões para diferentes perfis de usuários (Alunos, 
Moderadores, Professores e Admin).

ESTRUTURA DE DIRETÓRIOS E ARQUIVOS:

/ (Raiz)
├── index.html              # Estrutura principal do site (SPA - Single Page Application)
├── style.css               # Estilizações globais e customizações adicionais
├── README.txt              # Documentação da estrutura do projeto
│
├── js/                     # Lógica de programação (JavaScript)
│   ├── main.js             # Gerenciador central, controle de abas e autenticação
│   │
│   ├── core/               # Núcleo de funcionalidades do sistema
│   │   ├── firebase.js     # Configuração e inicialização do Firebase (Auth/Firestore)
│   │   └── utils.js        # Funções utilitárias reutilizáveis no sistema
│   │
│   ├── inicio/             # Módulo da aba "Início"
│   │   └── inicio.js       # Renderizador de conteúdo da página inicial
│   │
│   └── alunoTech/          # Módulo da aba "Aluno Tech"
│       └── perfilTech.js   # Lógica e interface específica para o perfil Aluno
│
└── imagens/                # Recursos visuais do projeto
    └── background/
        └── background-oficial.jpg  # Imagem de fundo principal do site

TECNOLOGIAS UTILIZADAS:
- HTML5 / CSS3 (Tailwind CSS via CDN)
- JavaScript (ES6 Modules)
- Firebase 10.8.1 (Authentication & Firestore)
- FontAwesome (Ícones)
- Google Fonts (Cinzel & Inter)

SISTEMA DE PERMISSÕES (MENU_ARCHITECTURE):
O sistema gerencia o acesso dinamicamente com base nos papéis:
- Início/Conteúdos/Projetos: Público (Visitante).
- Aluno Tech: Alunos, Moderadores, Professores, Coordenadores e Admins.
- Moderador Tech: Moderadores e superiores.
- Professor Tech: Professores, Coordenação e Admins.
- Admin Tech: Apenas Administradores.

NOTAS DE DESENVOLVIMENTO:
- O projeto funciona como uma Single Page Application (SPA), onde o 'main.js' 
  reconstrói o menu e o conteúdo das abas conforme o status de login do usuário.
================================================================================