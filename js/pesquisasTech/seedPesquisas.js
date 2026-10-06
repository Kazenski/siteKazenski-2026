// =========================================================
// SEED DE PESQUISAS PADRÃO (catálogo Tech Kazenski)
// Cria/atualiza as pesquisas oficiais no Firestore de forma
// idempotente (IDs determinísticos). Executado uma única vez
// pelo gestor, via aba "Pesquisas Tech → Gestão → Catálogo".
// =========================================================
import { db } from '../core/firebase.js';
import { doc, getDoc, getDocs, setDoc, collection, query, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const COL_PESQUISAS = 'pesquisas';

// Cada pergunta: label_texto, campo_chave, tipo_sql ('VARCHAR'|'INT'|'TEXT'),
// tamanho_max, opcoes (string separada por vírgula), ordem.
// As perguntas abertas foram convertidas em opções/Likert para quebrar
// em gráficos; o enunciado original é preservado.
const CATALOGO = [
    {
        id: 'tech_proficiencia_ia',
        titulo: 'Proficiência e Pensamento Crítico no Uso de IA',
        descricao: 'Mapeia o nível de maturidade do aluno no uso de ferramentas generativas: quem sabe pilotar a IA vs. quem é guiado por ela, avaliando também privacidade e alucinação.',
        status: 'Aberta',
        data_referencia: '2026',
        perguntas: [
            { label_texto: 'Como você estrutura um pedido quando precisa que a IA explique um conceito complexo ou resolva um bug?', campo_chave: 'estrutura_prompt', tipo_sql: 'VARCHAR', opcoes: 'Perguntou genérico, sem contexto,Dou contexto e restrições claras,Dou contexto + exemplo do erro,Atribuo papel (ex: "aja como eng. sênior") + contexto' },
            { label_texto: 'Quando a IA gera um código/comando, o que você faz antes de copiá-lo para o projeto?', campo_chave: 'validacao_codigo', tipo_sql: 'VARCHAR', opcoes: 'Copio e colo direto,Leio rapidamente antes de colar,Testo em ambiente de teste/sandbox,Testo e consulto a documentação oficial' },
            { label_texto: 'Já percebeu a IA inventando bibliotecas, funções ou comandos inexistentes? Como lidou?', campo_chave: 'identificacao_alucinacao', tipo_sql: 'VARCHAR', opcoes: 'Nunca notei,Notei mas não soube sair do "loop" de erro,Notei e refiz/reestruturei o prompt,Notei e validei na documentação antes de usar' },
            { label_texto: 'Em um projeto prático, quantos % do tempo você passa pesquisando em docs/fóruns vs. perguntando para a IA?', campo_chave: 'depende_ia_pct', tipo_sql: 'INT', opcoes: '0-100' },
            { label_texto: 'Você costuma dar exemplos (few-shot) ou atribuir papéis ("aja como engenheiro sênior") para a IA?', campo_chave: 'prompting_avancado', tipo_sql: 'VARCHAR', opcoes: 'Nunca,Às vezes,Frequentemente,Sempre' },
            { label_texto: 'Você entende o que acontece quando a conversa com a IA fica muito longa e ela "esquece" as regras iniciais?', campo_chave: 'janela_contexto', tipo_sql: 'VARCHAR', opcoes: 'Não sei,Entendo parcialmente,Entendo e contorno (reinicio/resumo regras),Entendo e uso técnicas como prompt com regras persistentes' },
            { label_texto: 'Você usa a IA mais para gerar o código inteiro do zero ou para entender a lógica de algo em que travou?', campo_chave: 'tutor_vs_gerador', tipo_sql: 'VARCHAR', opcoes: 'Gerar o código do zero,Mais gerar do que entender,Equilíbrio,Mais entender a lógica' },
            { label_texto: 'Você remove senhas, tokens ou chaves de API antes de enviar um erro para a IA analisar?', campo_chave: 'seguranca_prompt', tipo_sql: 'VARCHAR', opcoes: 'Não sabia que era um risco,Às vezes,Sempre,Uso versões sanitizadas/anonimizadas' },
            { label_texto: 'Além de IAs conversacionais (ChatGPT/Claude), você usa assistentes integrados ao editor (GitHub Copilot, Codeium)?', campo_chave: 'ia_no_editor', tipo_sql: 'VARCHAR', opcoes: 'Não sei o que são,Não uso,Uso às vezes,Uso diariamente' },
            { label_texto: 'Onde você traça a linha entre usar a IA como ferramenta de estudo e usá-la para colar em trabalho avaliativo?', campo_chave: 'etica_uso', tipo_sql: 'VARCHAR', opcoes: 'Não penso nisso,Me sinto livre para colar,Penso mas às vezes cruzo,Linha clara: só estudo/estrutura' },
        ]
    },
    {
        id: 'tech_alfabetizacao_digital',
        titulo: 'Alfabetização e Fluência Digital (Padrão Mercado/Concursos)',
        descricao: 'Avalia o domínio prático de ferramentas, SO, atalhos de produtividade e linha de comando. Foco em provas e testes de triagem.',
        status: 'Aberta',
        data_referencia: '2026',
        perguntas: [
            { label_texto: 'Qual a diferença prática e de performance entre PROCV (VLOOKUP) e ÍNDICE/CORRESP (INDEX/MATCH) ou PROCX?', campo_chave: 'excel_busca_avancada', tipo_sql: 'VARCHAR', opcoes: 'Não sei a diferença,Sei na teoria,Sei na prática,Uso PROCX/ÍNDICE-CORRESP com domínio' },
            { label_texto: 'Em qual cenário prático você escolheria uma Tabela Dinâmica em vez de múltiplas fórmulas condicionais (SOMASE, CONT.SE)?', campo_chave: 'excel_tabela_dinamica', tipo_sql: 'VARCHAR', opcoes: 'Nunca usei Tabela Dinâmica,Às vezes,Frequentemente,Sou referência na turma' },
            { label_texto: 'Se você precisar bloquear o PC rapidamente e depois abrir o Gerenciador de Tarefas sem usar o mouse, quais atalhos aperta?', campo_chave: 'atalhos_windows', tipo_sql: 'VARCHAR', opcoes: 'Não sei nenhum,Sei um dos dois (Win+L ou Ctrl+Shift+Esc),Sei ambos' },
            { label_texto: 'Qual comando você usa para listar todos os arquivos de um diretório, incluindo os ocultos, via terminal no Windows?', campo_chave: 'cmd_listar_arquivos', tipo_sql: 'VARCHAR', opcoes: 'Não sei,Sei apenas o dir básico,Sei usar dir /a (ou ls -Force no PS)' },
            { label_texto: 'Se a internet da escola cair, qual comando você usa para saber se o seu PC fala com o roteador local?', campo_chave: 'cmd_rede_ping', tipo_sql: 'VARCHAR', opcoes: 'Não sei,Ouvi falar em ping,Uso ping diariamente,Uso ping e tracert/diagnóstico completo' },
            { label_texto: 'Você sabe o que é e para que serve uma Expressão Regular (Regex) em validador de formulário ou pesquisa em texto?', campo_chave: 'regex', tipo_sql: 'VARCHAR', opcoes: 'Não sei o que é,Sei definir,Já criei regex simples (e-mail, CPF),Uso com domínio' },
            { label_texto: 'Qual a principal diferença estrutural entre um .CSV e um .JSON? Quando usar cada um?', campo_chave: 'formatos_dados', tipo_sql: 'VARCHAR', opcoes: 'Não sei a diferença,Sei que CSV é tabela e JSON é hierárquico,Sei e escolho conforme a integração' },
            { label_texto: 'Rodando uma máquina virtual ou compilando código pesado, qual o impacto prático de pouca RAM vs. não ter SSD?', campo_chave: 'impacto_hardware', tipo_sql: 'VARCHAR', opcoes: 'Não faço ideia,Sei um pouco,Entendo o impacto distinto de cada um' },
            { label_texto: 'No Linux, se você ver chmod 777, o que ele faz e por que é má prática de segurança?', campo_chave: 'linux_chmod', tipo_sql: 'VARCHAR', opcoes: 'Não sei,Sei que libera permissão total,Sei explicar que é arriscado e como evitar' },
            { label_texto: 'Como você usaria a aba "Network"/"Console" (F12) no Chrome para investigar um site que não carrega as imagens?', campo_chave: 'devtools_navegador', tipo_sql: 'VARCHAR', opcoes: 'Não uso DevTools,Uso às vezes,Uso para investigar sites,Uso profissionalmente' },
        ]
    },
    {
        id: 'tech_saude_mental',
        titulo: 'Saúde Mental e Carga Cognitiva na Área Técnica',
        descricao: 'Investiga resiliência emocional, níveis de estresse, frustração e fatores ambientais que afetam o aprendizado nas disciplinas exatas.',
        status: 'Aberta',
        data_referencia: '2026',
        perguntas: [
            { label_texto: 'Ao passar mais de 2 horas tentando resolver um bug sem sucesso, qual é sua reação física e mental?', campo_chave: 'gestao_frustracao', tipo_sql: 'VARCHAR', opcoes: 'Entro em espiral de ansiedade,Fico irritado e insistem,Faço pausa e volto com calma,Peço ajuda rapidamente' },
            { label_texto: 'Com que frequência você sente não ser bom o suficiente para a área técnica, mesmo tirando notas boas?', campo_chave: 'sindrome_impostor', tipo_sql: 'VARCHAR', opcoes: 'Nunca,Raramente,Às vezes,Frequentemente' },
            { label_texto: 'Quantas horas por dia (estudo + lazer) você passa olhando para telas?', campo_chave: 'horas_tela', tipo_sql: 'INT', opcoes: '0-24' },
            { label_texto: 'Como você avalia sua qualidade de sono atual? (1 = péssima, 10 = ótima)', campo_chave: 'qualidade_sono', tipo_sql: 'INT', opcoes: '1-10' },
            { label_texto: 'Você se sente mentalmente exausto a ponto de não absorver informação nova ao final das semanas de projetos?', campo_chave: 'burnout', tipo_sql: 'VARCHAR', opcoes: 'Sempre,Em semanas de projetos difíceis,Raramente,Nunca' },
            { label_texto: 'O que você faz ativamente para "desligar" o cérebro da tecnologia fora do estudo?', campo_chave: 'descompressao', tipo_sql: 'TEXT', tamanho_max: 500, opcoes: '' },
            { label_texto: 'O quanto redes sociais (LinkedIn, Instagram, YouTube) fazem você se sentir atrasado em relação aos outros?', campo_chave: 'comparacao_social', tipo_sql: 'VARCHAR', opcoes: 'Nada,Pouco,Moderadamente,Muito' },
            { label_texto: 'Você sente dificuldade em focar na leitura de documentações longas sem trocar de aba ou pegar o celular?', campo_chave: 'dificuldade_foco', tipo_sql: 'VARCHAR', opcoes: 'Não,Às vezes,Frequentemente,Sempre' },
            { label_texto: 'Com que frequência sente dores nas costas, punhos (LER/DORT) ou de cabeça após aulas práticas?', campo_chave: 'ergonomia', tipo_sql: 'VARCHAR', opcoes: 'Nunca,Raramente,Às vezes,Frequentemente' },
            { label_texto: 'Você se sente confortável em admitir dúvidas para professores/colegas, ou prefere esconder que não entendeu?', campo_chave: 'rede_apoio', tipo_sql: 'VARCHAR', opcoes: 'Admitio-me com facilidade,Às vezes admitio,Prefiro esconder,Não me sinto seguro' },
        ]
    },
    {
        id: 'tech_etica_seguranca',
        titulo: 'Ética, Propriedade Intelectual e Segurança Corporativa',
        descricao: 'Avalia noções fundamentais de cibersegurança e direitos autorais — pontos que o mercado pune severamente.',
        status: 'Aberta',
        data_referencia: '2026',
        perguntas: [
            { label_texto: 'Qual é a fronteira entre usar um código do StackOverflow para se inspirar e cometer plágio acadêmico/corporativo?', campo_chave: 'plagio_referencia', tipo_sql: 'VARCHAR', opcoes: 'Não sabia que existia linha,Depende do contexto e de citar a fonte,Não me preocupo,Não sei definir' },
            { label_texto: 'Achando bibliotecas "GPL" e "MIT", sabe dizer qual permite uso em projeto fechado para venda sem abrir o código?', campo_chave: 'licencas_opensource', tipo_sql: 'VARCHAR', opcoes: 'Não sei a diferença,Sei que MIT é permissiva,Sei que MIT e GPL têm usos diferentes,Já apliquei na prática' },
            { label_texto: 'Você usa a mesma senha (ou variações) para sistemas escolares, e-mail e repositórios de código?', campo_chave: 'reuso_senhas', tipo_sql: 'VARCHAR', opcoes: 'Sim, sempre a mesma,Variações parecidas,Senhas diferentes,Uso gerenciador de senhas' },
            { label_texto: 'O que você faz antes de logar em sistema com dados sensíveis usando Wi-Fi aberto da escola ou de um café?', campo_chave: 'higiene_wifi', tipo_sql: 'VARCHAR', opcoes: 'Logo sem verificar,Evito logar em sistemas sensíveis,Uso VPN,Só acesso em rede conhecida' },
            { label_texto: 'Você já deu commit com senha de banco ou chave de API no GitHub público (ou conhece o risco)?', campo_chave: 'vazamento_credenciais', tipo_sql: 'VARCHAR', opcoes: 'Já cometi o erro,Conheço o risco e evito com .gitignore,Só uso variáveis de ambiente,Não sabia do risco' },
            { label_texto: 'Você saberia identificar um e-mail falso se passando pelo suporte da Microsoft, AWS ou GitHub pedindo revalidação de token?', campo_chave: 'phishing', tipo_sql: 'VARCHAR', opcoes: 'Cairia fácil,Desconfiaria,Identificaria na maioria,Identificaria e reportaria' },
            { label_texto: 'Ao desenhar um banco de dados escolar, você se preocupa em criptografar senhas e não guardar dados desnecessários (LGPD)?', campo_chave: 'lgpd_privacy_by_design', tipo_sql: 'VARCHAR', opcoes: 'Não sei o que é,Já ouvi falar,Aplico criptografia básica,Aplico criptografia + minimização total de dados' },
            { label_texto: 'Você costuma baixar softwares piratas, ativadores ("cracks") ou ferramentas não autorizadas no PC de estudo/trabalho?', campo_chave: 'shadow_it', tipo_sql: 'VARCHAR', opcoes: 'Sim, sempre uso,Às vezes,Raramente,Nunca' },
            { label_texto: 'Se um código seu (ou gerado por IA) for para produção e causar prejuízo financeiro, de quem é a culpa ética?', campo_chave: 'responsabilidade_codigo', tipo_sql: 'VARCHAR', opcoes: 'Da IA,Do desenvolvedor que validou/usou,Da empresa/instituição,Responsabilidade compartilhada' },
            { label_texto: 'Você se sente responsável por educar familiares leigos sobre fraudes digitais e áudios fakes gerados por IA?', campo_chave: 'educar_familiares', tipo_sql: 'VARCHAR', opcoes: 'Sim, com frequência,Às vezes,Raramente,Não me sinto responsável' },
        ]
    },
    {
        id: 'tech_softskills_mercado',
        titulo: 'Soft Skills, Versionamento e Preparo para o Mercado',
        descricao: 'Mensura habilidades interpessoais, metodologias ágeis e ferramentas de mercado, estimando o quão "empregável" o aluno está hoje.',
        status: 'Aberta',
        data_referencia: '2026',
        perguntas: [
            { label_texto: 'Descreva o fluxo exato e a diferença entre git add, git commit e git push.', campo_chave: 'git_basico', tipo_sql: 'VARCHAR', opcoes: 'Não sei,Sei na teoria,Sei na prática,Uso e explico para colegas' },
            { label_texto: 'O que você faz quando o git pull retorna um "Merge Conflict"?', campo_chave: 'git_conflito', tipo_sql: 'VARCHAR', opcoes: 'Não sei resolver,Aborto o merge e chamo ajuda,Peço orientação ao colega,Entendo as divergências e resolvo' },
            { label_texto: 'Identificando erro de lógica muito primário no código de um colega em trabalho em grupo, como você fala?', campo_chave: 'feedback_code_review', tipo_sql: 'VARCHAR', opcoes: 'Falo direto, sem tanto jeito,Falo com jeito mas direto,Sempre com empatia e sugestão de solução,Evito falar' },
            { label_texto: 'Você prefere programar junto com alguém na mesma tela (pair programming) ou cada um sua parte isolado?', campo_chave: 'pair_programming', tipo_sql: 'VARCHAR', opcoes: 'Prefiro isolado,Depende da tarefa,Prefiro pair programming,Faço os dois conforme o contexto' },
            { label_texto: 'O professor pediu trabalho usando ferramenta não ensinada em aula. Qual é o seu plano de ação?', campo_chave: 'autodidatismo', tipo_sql: 'VARCHAR', opcoes: 'Travo e espero ajuda,Pesquiso por horas até achar algo,Pesquiso e aplico rápido,Tenho plano: docs oficiais + exemplos' },
            { label_texto: 'Como você explicaria "API" ou "Banco de Dados" para um parente idoso ou cliente leigo?', campo_chave: 'traducao_tecnica', tipo_sql: 'VARCHAR', opcoes: 'Não conseguiria,Uso comparação simples,Crio analogia do dia a dia,Crio analogia + exemplo prático' },
            { label_texto: 'Você sabe o que é Sprint, quadro Kanban (Trello/Jira) ou para que serve uma Daily Meeting?', campo_chave: 'agil', tipo_sql: 'VARCHAR', opcoes: 'Não conheço,Já ouvi falar,Entendo e já participei de algumas,Aplico em trabalhos em grupo' },
            { label_texto: 'Seu perfil no GitHub/LinkedIn reflete o que aprendeu na escola? Os repositórios têm README explicando o projeto?', campo_chave: 'portfolio_github', tipo_sql: 'VARCHAR', opcoes: 'Não tenho,Tenho mas sem README,Tenho e README básico,Tenho portfólio caprichado com README completo' },
            { label_texto: 'Como você reage quando um professor ou sênior diz que seu código está desorganizado (Clean Code)?', campo_chave: 'receptividade_criticas', tipo_sql: 'VARCHAR', opcoes: 'Fico na defensiva,Incomodo, mas aceito,Recebo bem e aplico,Peço mais feedback para melhorar' },
            { label_texto: 'Considerando as 5 disciplinas que estuda, em qual subárea você deseja atuar?', campo_chave: 'subarea_carreira', tipo_sql: 'VARCHAR', opcoes: 'Front-end,Back-end,Infraestrutura/Suporte,Dados,Segurança,UI/UX' },
        ]
    },
];

export async function seedPesquisasTecnologicas() {
    let criadas = 0, atualizadas = 0, puladas = 0;
    for (const p of CATALOGO) {
        const ref = doc(db, COL_PESQUISAS, p.id);
        const snap = await getDoc(ref);
        const dados = {
            titulo: p.titulo,
            descricao: p.descricao,
            status: p.status,
            data_referencia: p.data_referencia,
            origem: 'catalogo_tech',
            atualizadoEm: serverTimestamp()
        };
        if (!snap.exists()) {
            dados.criadoEm = serverTimestamp();
            await setDoc(ref, dados);
            criadas++;
        } else {
            await setDoc(ref, dados, { merge: true });
            atualizadas++;
        }
        const batch = writeBatch(db);
        p.perguntas.forEach((q, i) => {
            batch.set(doc(collection(db, COL_PESQUISAS, p.id, 'perguntas'), `q${i + 1}`), {
                label_texto: q.label_texto,
                campo_chave: q.campo_chave,
                tipo_sql: q.tipo_sql,
                tamanho_max: q.tamanho_max || 100,
                opcoes: q.opcoes || '',
                ordem: i + 1,
            }, { merge: true });
        });
        await batch.commit();
    }

    // ---------------------------------------------------------
    // DIAGNÓSTICO DE CONVIVÊNCIA DIGITAL (pesquisa herdada do
    // Supabase com tabela legada 'respostas_pesquisa').
    // As perguntas desse formulário não estavam na subcoleção
    // 'perguntas' no Firebase — este bloco as recria usando os
    // mesmos campos/tipos vistos no painel antigo.
    // ---------------------------------------------------------
    const perguntasConvivencia = [
        { label_texto: 'Em qual série você estuda?', campo_chave: 'serie', tipo_sql: 'VARCHAR', opcoes: '6º Ano, 7º Ano, 8º Ano, 9º Ano, 1ª Série EM, 2ª Série EM, 3ª Série EM' },
        { label_texto: 'Qual a sua idade? (apenas número)', campo_chave: 'idade', tipo_sql: 'INT', tamanho_max: 2, opcoes: '' },
        { label_texto: 'Com que gênero você se identifica?', campo_chave: 'genero', tipo_sql: 'VARCHAR', opcoes: 'Feminino, Masculino, Outro, Prefiro não informar' },
        { label_texto: 'Em média, quantas horas por dia você passa no celular/redes sociais online?', campo_chave: 'tempo_tela', tipo_sql: 'VARCHAR', opcoes: 'Menos de 1h, 1h a 3h, 3h a 5h, Mais de 5h' },
        { label_texto: 'Você já presenciou algum episódio de cyberbullying na escola?', campo_chave: 'presenciou_bullying', tipo_sql: 'VARCHAR', opcoes: 'Sim, Não, Não tenho certeza' },
        { label_texto: 'Você já foi vítima de ofensas/zoação em redes/exposição virtual?', campo_chave: 'foi_vitima', tipo_sql: 'VARCHAR', opcoes: 'Sim, Não' },
        { label_texto: 'Em qual ambiente digital ocorrem mais casos de denúncias?', campo_chave: 'ambiente_risco', tipo_sql: 'VARCHAR', opcoes: 'Instagram, TikTok, WhatsApp, Facebook, Jogos Online, Outros' },
        { label_texto: 'Se enfrenta violência digital hoje, saberia a quem pedir ajuda na escola?', campo_chave: 'sabe_pedir_ajuda', tipo_sql: 'VARCHAR', opcoes: 'Sim, Não' },
        { label_texto: 'Qual você acredita ser o motivo mais frequente para o cyberbullying?', campo_chave: 'motivo_frequencia', tipo_sql: 'VARCHAR', opcoes: 'Aparência física, Opiniões pessoais, Condição financeira, Orientação/Identidade, Ação/brincadeira "para se autovalorizar", Outro' },
        { label_texto: 'Qual jogo(s) você mais utiliza?', campo_chave: 'jogos_mais_usado', tipo_sql: 'VARCHAR', opcoes: 'Free Fire, Valorant, LOL, Roblox, Minecraft, Outro/Nenhum' },
    ];
    let convivenciaAtualizada = 0;
    try {
        const snapPesq = await getDocs(query(collection(db, COL_PESQUISAS)));
        for (const d of snapPesq.docs) {
            const p = d.data() || {};
            const ehConvivencia = p.tabela_respostas_alvo === 'respostas_pesquisa'
                || /conviv[eê]ncia/i.test(String(p.titulo || ''));
            if (!ehConvivencia) continue;
            const batch2 = writeBatch(db);
            perguntasConvivencia.forEach((q, i) => {
                batch2.set(doc(collection(db, COL_PESQUISAS, d.id, 'perguntas'), `q${i + 1}`), {
                    label_texto: q.label_texto,
                    campo_chave: q.campo_chave,
                    tipo_sql: q.tipo_sql,
                    tamanho_max: q.tamanho_max || 100,
                    opcoes: q.opcoes || '',
                    ordem: i + 1,
                }, { merge: true });
            });
            await batch2.commit();
            convivenciaAtualizada++;
        }
    } catch (e) {
        console.error('Erro ao recriar perguntas de Convivência:', e);
    }

    return { criadas, atualizadas, puladas, convivenciaAtualizada };
}
