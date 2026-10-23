// Lógica pura das questões de prova (sem Firebase), para ser testável.

export const TIPOS = {
    multipla_escolha: 'Múltipla escolha (uma correta)',
    multipla_selecao: 'Múltipla seleção (várias corretas)',
    verdadeiro_falso: 'Verdadeiro ou falso (lista)',
    ligar_colunas: 'Ligar colunas',
    ordenar: 'Ordenar sequência',
    python: 'Código Python (testes automáticos)',
    sql: 'SQL (consulta na base da prova)',
    dissertativa: 'Dissertativa (correção manual)'
};

const limpo = (s) => (s ?? '').toString().trim();

export function novaQuestao(tipo = 'multipla_escolha') {
    return {
        tipo,
        enunciado: '',
        pontos: 1,
        explicacao: '',
        opcoes: [{ texto: '', correta: false }, { texto: '', correta: false }],
        afirmacoes: [{ texto: '', valor: true }],
        pares: [{ a: '', b: '' }, { a: '', b: '' }],
        itens: ['', ''],
        codigoInicial: '',
        sql: '',
        consultaInicial: '',
        testes: [{ entrada: '', saida: '', oculto: false }]
    };
}

export function embaralhar(arr, rnd = Math.random) {
    const copia = [...arr];
    const embaralhado = () => {
        for (let i = copia.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [copia[i], copia[j]] = [copia[j], copia[i]];
        }
        return copia;
    };
    if (arr.length < 2) return copia;
    // Evita entregar ao aluno a mesma ordem da resposta certa.
    for (let t = 0; t < 20; t++) {
        const r = embaralhado();
        if (r.some((x, i) => x !== arr[i])) return r;
    }
    return copia;
}

export function validarQuestoes(lista) {
    const erros = [];
    lista.forEach((q, i) => {
        const n = `Questão ${i + 1}`;
        if (!limpo(q.enunciado)) erros.push(`${n}: escreva o enunciado.`);
        if (!(Number(q.pontos) > 0)) erros.push(`${n}: os pontos devem ser maiores que zero.`);

        if (q.tipo === 'multipla_escolha' || q.tipo === 'multipla_selecao') {
            const preenchidas = q.opcoes.filter(o => limpo(o.texto));
            const corretas = preenchidas.filter(o => o.correta).length;
            if (preenchidas.length < 2) erros.push(`${n}: informe pelo menos 2 opções.`);
            if (q.tipo === 'multipla_escolha' && corretas !== 1) erros.push(`${n}: marque exatamente uma opção correta.`);
            if (q.tipo === 'multipla_selecao' && corretas < 1) erros.push(`${n}: marque pelo menos uma opção correta.`);
        }

        if (q.tipo === 'verdadeiro_falso') {
            if (q.afirmacoes.filter(a => limpo(a.texto)).length < 1) erros.push(`${n}: informe pelo menos uma afirmação.`);
        }

        if (q.tipo === 'ligar_colunas') {
            const incompletos = q.pares.some(p => Boolean(limpo(p.a)) !== Boolean(limpo(p.b)));
            if (incompletos) erros.push(`${n}: há pares com um lado vazio.`);
            if (q.pares.filter(p => limpo(p.a) && limpo(p.b)).length < 2) erros.push(`${n}: informe pelo menos 2 pares.`);
        }

        if (q.tipo === 'ordenar') {
            if (q.itens.filter(t => limpo(t)).length < 2) erros.push(`${n}: informe pelo menos 2 itens.`);
        }

        if (q.tipo === 'sql') {
            if (!limpo(q.sql)) erros.push(`${n}: informe a consulta gabarito.`);
        }

        if (q.tipo === 'python') {
            const testes = q.testes.filter(t => limpo(t.saida));
            if (testes.length < 1) erros.push(`${n}: informe pelo menos um teste com saída esperada.`);
            if (q.testes.some(t => limpo(t.entrada) && !limpo(t.saida))) erros.push(`${n}: há teste com entrada e sem saída esperada.`);
        }
    });
    return erros;
}

// Gera os documentos gravados no Firestore. O gabarito e a explicação vão
// separados das questões, e a ordem exibida ao aluno é embaralhada.
export function montarDocs(lista, rnd = Math.random) {
    return lista.map((q, i) => {
        const id = `q${i + 1}`;
        const base = {
            ordem: i + 1,
            tipo: q.tipo,
            enunciado: limpo(q.enunciado),
            pontos: Number(q.pontos) || 0
        };
        const explicacao = limpo(q.explicacao);

        switch (q.tipo) {
            case 'multipla_escolha':
            case 'multipla_selecao': {
                const ops = q.opcoes
                    .filter(o => limpo(o.texto))
                    .map((o, k) => ({ id: `o${k + 1}`, texto: limpo(o.texto), correta: !!o.correta }));
                const gabarito = q.tipo === 'multipla_escolha'
                    ? (ops.find(o => o.correta)?.id ?? null)
                    : ops.filter(o => o.correta).map(o => o.id);
                return {
                    id,
                    questao: { ...base, opcoes: ops.map(({ id, texto }) => ({ id, texto })) },
                    gabarito,
                    explicacao
                };
            }

            case 'verdadeiro_falso': {
                const afs = q.afirmacoes
                    .filter(a => limpo(a.texto))
                    .map((a, k) => ({ id: `a${k + 1}`, texto: limpo(a.texto), valor: a.valor === true || a.valor === 'true' }));
                return {
                    id,
                    questao: { ...base, afirmacoes: afs.map(({ id, texto }) => ({ id, texto })) },
                    gabarito: Object.fromEntries(afs.map(a => [a.id, a.valor])),
                    explicacao
                };
            }

            case 'ligar_colunas': {
                const pares = q.pares.filter(p => limpo(p.a) && limpo(p.b));
                const colunaA = pares.map((p, k) => ({ id: `a${k + 1}`, texto: limpo(p.a) }));
                const colunaB = embaralhar(pares.map((p, k) => ({ id: `b${k + 1}`, texto: limpo(p.b) })), rnd);
                return {
                    id,
                    questao: { ...base, colunaA, colunaB },
                    gabarito: Object.fromEntries(pares.map((p, k) => [`a${k + 1}`, `b${k + 1}`])),
                    explicacao
                };
            }

            case 'ordenar': {
                const itens = q.itens
                    .filter(t => limpo(t))
                    .map((t, k) => ({ id: `i${k + 1}`, texto: limpo(t) }));
                return {
                    id,
                    questao: { ...base, itens: embaralhar(itens, rnd).map(({ id, texto }) => ({ id, texto })) },
                    gabarito: itens.map(i => i.id),
                    explicacao
                };
            }

            case 'sql': {
                const sql = limpo(q.sql);
                return {
                    id,
                    questao: { ...base, consultaInicial: limpo(q.consultaInicial) },
                    gabarito: { sql, ordenada: /\border\s+by\b/i.test(sql) },
                    explicacao
                };
            }

            case 'python': {
                const testes = q.testes
                    .filter(t => limpo(t.saida))
                    .map(t => ({ entrada: t.entrada ?? '', saida: String(t.saida).trim(), oculto: !!t.oculto }));
                return {
                    id,
                    questao: {
                        ...base,
                        codigoInicial: q.codigoInicial || '',
                        testesVisiveis: testes.filter(t => !t.oculto).map(({ entrada, saida }) => ({ entrada, saida }))
                    },
                    gabarito: { testes },
                    explicacao
                };
            }

            default:
                return { id, questao: base, gabarito: null, explicacao };
        }
    });
}

// Reconstrói o estado do editor a partir dos documentos salvos (para editar).
export function estadoDeQuestao(qd, gabDoc) {
    const g = gabDoc?.gabarito;
    const estado = novaQuestao(qd.tipo);
    estado.enunciado = qd.enunciado || '';
    estado.pontos = qd.pontos ?? 1;
    estado.explicacao = gabDoc?.explicacao || '';

    switch (qd.tipo) {
        case 'multipla_escolha':
            estado.opcoes = (qd.opcoes || []).map(o => ({ texto: o.texto, correta: o.id === g }));
            break;
        case 'multipla_selecao':
            estado.opcoes = (qd.opcoes || []).map(o => ({ texto: o.texto, correta: Array.isArray(g) && g.includes(o.id) }));
            break;
        case 'verdadeiro_falso':
            estado.afirmacoes = (qd.afirmacoes || []).map(a => ({ texto: a.texto, valor: g?.[a.id] === true }));
            break;
        case 'ligar_colunas':
            estado.pares = (qd.colunaA || []).map(a => {
                const bId = g?.[a.id];
                const b = (qd.colunaB || []).find(x => x.id === bId);
                return { a: a.texto, b: b ? b.texto : '' };
            });
            break;
        case 'ordenar':
            estado.itens = (g || []).map(id => (qd.itens || []).find(i => i.id === id)?.texto || '');
            break;
        case 'sql':
            estado.consultaInicial = qd.consultaInicial || '';
            estado.sql = g?.sql || '';
            break;
        case 'python':
            estado.codigoInicial = qd.codigoInicial || '';
            estado.testes = (g?.testes || []).map(t => ({ entrada: t.entrada || '', saida: t.saida || '', oculto: !!t.oculto }));
            if (estado.testes.length === 0) estado.testes = [{ entrada: '', saida: '', oculto: false }];
            break;
    }
    return estado;
}

