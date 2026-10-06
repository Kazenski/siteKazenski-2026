const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');

initializeApp();

// Chave da API do Gemini - configure com: firebase functions:secrets:set GEMINI_API_KEY
const geminiApiKey = defineSecret('GEMINI_API_KEY');

/**
 * Recalcula o ranking da votação sempre que um voto é criado ou removido.
 * Escreve em votacoes/{votacaoId}/ranking/atual — único documento que os
 * alunos podem ler (os votos brutos ficam restritos a Admin/Moderador).
 */
async function recalcular(votacaoId) {
    const db = getFirestore();
    const votosSnap = await db.collection(`votacoes/${votacaoId}/votos`).get();

    const contagem = {};
    votosSnap.forEach(d => {
        const musicaId = d.data().musicaId;
        contagem[musicaId] = (contagem[musicaId] || 0) + 1;
    });

    const totalVotos = votosSnap.size;
    const podium = Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .map(([musicaId, votos]) => ({ musicaId, votos, pct: totalVotos ? Math.round((votos / totalVotos) * 100) : 0 }));

    await db.doc(`votacoes/${votacaoId}/ranking/atual`).set({
        totalVotos,
        contagem,
        podium,
        atualizadoEm: FieldValue.serverTimestamp()
    });
}

exports.atualizarRankingVoto = onDocumentCreated('votacoes/{votacaoId}/votos/{uid}', async (event) => {
    await recalcular(event.params.votacaoId);
});

exports.atualizarRankingVotoDeletado = onDocumentDeleted('votacoes/{votacaoId}/votos/{uid}', async (event) => {
    await recalcular(event.params.votacaoId);
});

// ==========================================
// KAZ IA - Gerador de Planos com Gemini
// ==========================================

const MODELOS_VALIDOS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

/**
 * Busca planos existentes da mesma disciplina para contexto
 */
async function buscarPlanosExistentes(db, disciplinaId, turmaId, limit = 5) {
    try {
        let query = db.collection('planos_aula_ia')
            .where('disciplinaId', '==', disciplinaId)
            .orderBy('dataCriacao', 'desc')
            .limit(limit);

        if (turmaId) {
            query = db.collection('planos_aula_ia')
                .where('disciplinaId', '==', disciplinaId)
                .where('turmaId', '==', turmaId)
                .orderBy('dataCriacao', 'desc')
                .limit(limit);
        }

        const snap = await query.get();
        const planos = [];
        snap.forEach(doc => {
            const data = doc.data();
            planos.push({
                id: doc.id,
                titulo: data.titulo,
                tipoPlano: data.tipoPlano,
                assuntoBase: data.assuntoBase,
                conteudo: data.conteudoTextual || data.conteudoHtml,
                dataCriacao: data.dataCriacao?.toDate?.()?.toISOString() || null
            });
        });
        return planos;
    } catch (e) {
        console.warn('Erro ao buscar planos existentes:', e);
        return [];
    }
}

/**
 * Monta o prompt para a IA com contexto completo
 */
function montarPromptBNCC(dados) {
    const { tipo, disciplina, turma, aulasSemanais, assunto, trimestre, fontes, modeloPlanejamento, planosExistentes, escola } = dados;

    const tipoPlanoTexto = {
        diario: 'Plano de Aula Diário (1 aula)',
        mensal: 'Plano Mensal (4 semanas de aula)',
        anual: 'Plano Anual Completo (ano letivo)'
    }[tipo] || 'Plano de Aula';

    const instrucoesTipo = {
        diario: `Estrutura para 1 aula de 50 minutos:
- Objetivos de Aprendizagem (específicos e mensuráveis)
- Competências e Habilidades BNCC (citar código exato: ex: EF09MA12)
- Desenvolvimento da Aula (momento a momento com tempos)
- Recursos Necessários
- Avaliação (formato e critérios)
- Referências BNCC`,
        mensal: `Estrutura para 4 semanas (1 mês):
- Visão Geral do Mês
- Competências e Habilidades BNCC a desenvolver (citar códigos)
- Cronograma Semanal (Semana 1, 2, 3, 4 com temas e objetivos)
- Metodologias por semana
- Avaliação do mês (rubrica em tabela)
- Referências BNCC`,
        anual: `Estrutura para o ano letivo:
- Visão Geral Anual
- Competências Gerais e Específicas da BNCC
- Competências e Habilidades por Bimestre/Trimestre (citar códigos BNCC)
- Cronograma de Avaliações
- Metodologias e Recursos ao longo do ano
- Avaliação Anual (rubrica em tabela)
- Referências BNCC`
    }[tipo] || '';

    const fontesTexto = fontes && fontes.length > 0
        ? `\n\nFONTES DE REFERÊNCIA (use como base para o planejamento):\n${fontes.map(f => `- ${f.titulo}`).join('\n')}\n\nInstrução: Cruze o assunto com as Habilidades da BNCC contidas nos documentos em anexo. Cite os códigos das habilidades (ex: EF09MA12, EM13CHSA01) sempre que aplicável.`
        : '\n\nInstrução: Baseie-se na BNCC e nas Diretrizes Curriculares de Santa Catarina. Cite os códigos das habilidades sempre que aplicável.';

    const modeloPlanejamentoTexto = modeloPlanejamento
        ? `\n\nMODELO DE PLANEJAMENTO DA ESCOLA:
A escola "${escola || 'não especificada'}" utiliza o seguinte modelo de planejamento:
${modeloPlanejamento}

Instrução: Adapte a estrutura do plano ao modelo acima. Mantenha os campos e a organização esperada pela escola.`
        : '';

    const planosExistentesTexto = planosExistentes && planosExistentes.length > 0
        ? `\n\nPLANOS EXISTENTES DA MESMA DISCIPLINA (use como referência para evolução e consistência):
${planosExistentes.map((p, i) => `
--- Plano ${i + 1}: ${p.titulo} (${p.tipoPlano}) ---
${p.conteudo?.substring(0, 2000) || 'Conteúdo não disponível'}
`).join('\n')}

Instrução: Analise os planos acima para:
1. Identificar o que já foi abordado
2. Evitar repetição de conteúdo
3. Manter a progressão pedagógica
4. Sugerir evoluções e melhorias
5. Referenciar planos anteriores quando pertinente`
        : '';

    return `Atue como um Especialista Pedagógico Sênior com profundo conhecimento da BNCC (Base Nacional Comum Curricular) e das Diretrizes Curriculares de Santa Catarina.

CONTEXTO DO PLANEJAMENTO:
- Escola: ${escola || 'Não especificada'}
- Tipo de Plano: ${tipoPlanoTexto}
- Disciplina: ${disciplina}
- Turma/Série: ${turma}
- Carga Horária: ${aulasSemanais} aulas semanais
- Trimestre: ${trimestre || 'Não especificado'}
- Assunto Central: "${assunto}"

${instrucoesTipo}
${fontesTexto}
${modeloPlanejamentoTexto}
${planosExistentesTexto}

INSTRUÇÕES DE SAÍDA OBRIGATÓRIAS:
1. Retorne APENAS TEXTO PURO formatado em Markdown. NÃO use HTML.
2. Use títulos com ## e subtítulos com ### para estruturar o conteúdo.
3. Use tabelas Markdown (| Coluna | Coluna |) para cronogramas e rubricas.
4. Destaque os códigos da BNCC em negrito (ex: **EF09MA12**).
5. Inclua uma seção de "Referências" ao final citando a BNCC e documentos usados.
6. O conteúdo deve ser prático, detalhado e pronto para uso em sala de aula.
7. Adapte a linguagem e a complexidade à turma especificada.
8. Inclua sugestões de atividades práticas e recursos quando pertinente.
9. Para planos mensais e anuais, inclua uma visão geral no início e detalhamento por período.
10. O texto deve ser claro e direto, permitindo copiar e colar diretamente no modelo da escola.

IMPORTANTE: O texto deve ser completo, bem estruturado e pronto para uso. Não inclua comentários ou explicações fora do conteúdo do plano.`;
}

/**
 * Salva um plano gerado no Firestore
 */
exports.salvarPlano = onCall({
    timeoutSeconds: 60,
    memory: '512MB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
    }

    const { titulo, conteudo, tipoPlano, disciplinaId, disciplinaNome, turmaId, turmaNome, escolaId, escolaNome, trimestre, aulasSemanais, assuntoBase } = request.data;

    if (!titulo || !conteudo || !disciplinaId || !turmaId) {
        throw new HttpsError('invalid-argument', 'Dados incompletos para salvar o plano.');
    }

    const db = getFirestore();

    try {
        const payload = {
            titulo,
            conteudoTextual: conteudo,
            tipoPlano,
            disciplinaId,
            disciplinaNome,
            turmaId,
            turmaNome,
            escolaId: escolaId || null,
            escolaNome: escolaNome || null,
            trimestre: trimestre || null,
            aulasSemanais: aulasSemanais || null,
            assuntoBase: assuntoBase || '',
            professorUid: request.auth.uid,
            dataCriacao: FieldValue.serverTimestamp(),
            atualizadoEm: FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('planos_aula_ia').add(payload);

        return {
            sucesso: true,
            id: docRef.id,
            mensagem: 'Plano salvo com sucesso!'
        };

    } catch (error) {
        console.error('Erro ao salvar plano:', error);
        throw new HttpsError('internal', error.message || 'Erro ao salvar plano.');
    }
});

/**
 * Lista planos existentes com filtros
 */
exports.listarPlanos = onCall({
    timeoutSeconds: 60,
    memory: '512MB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
    }

    const { escolaId, turmaId, disciplinaId, trimestre } = request.data;

    const db = getFirestore();

    try {
        let query = db.collection('planos_aula_ia')
            .where('professorUid', '==', request.auth.uid)
            .orderBy('dataCriacao', 'desc')
            .limit(50);

        // Aplica filtros adicionais se fornecidos
        if (escolaId) {
            query = db.collection('planos_aula_ia')
                .where('professorUid', '==', request.auth.uid)
                .where('escolaId', '==', escolaId)
                .orderBy('dataCriacao', 'desc')
                .limit(50);
        }

        const snap = await query.get();
        const planos = [];

        snap.forEach(doc => {
            const data = doc.data();
            // Filtra por turma, disciplina e trimestre no cliente (para evitar índices compostos)
            if (turmaId && data.turmaId !== turmaId) return;
            if (disciplinaId && data.disciplinaId !== disciplinaId) return;
            if (trimestre && data.trimestre !== trimestre) return;

            planos.push({
                id: doc.id,
                titulo: data.titulo,
                tipoPlano: data.tipoPlano,
                disciplinaNome: data.disciplinaNome,
                turmaNome: data.turmaNome,
                escolaNome: data.escolaNome,
                trimestre: data.trimestre,
                dataCriacao: data.dataCriacao?.toDate?.()?.toISOString() || null,
                conteudoPreview: (data.conteudoTextual || '').substring(0, 200)
            });
        });

        return {
            sucesso: true,
            planos: planos,
            total: planos.length
        };

    } catch (error) {
        console.error('Erro ao listar planos:', error);
        throw new HttpsError('internal', error.message || 'Erro ao listar planos.');
    }
});

/**
 * Busca um plano específico pelo ID
 */
exports.buscarPlano = onCall({
    timeoutSeconds: 60,
    memory: '512MB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
    }

    const { planoId } = request.data;

    if (!planoId) {
        throw new HttpsError('invalid-argument', 'ID do plano não fornecido.');
    }

    const db = getFirestore();

    try {
        const docSnap = await db.collection('planos_aula_ia').doc(planoId).get();

        if (!docSnap.exists) {
            throw new HttpsError('not-found', 'Plano não encontrado.');
        }

        const data = docSnap.data();

        // Verifica se o plano pertence ao usuário
        if (data.professorUid !== request.auth.uid) {
            throw new HttpsError('permission-denied', 'Você não tem permissão para acessar este plano.');
        }

        return {
            sucesso: true,
            plano: {
                id: docSnap.id,
                titulo: data.titulo,
                conteudo: data.conteudoTextual,
                tipoPlano: data.tipoPlano,
                disciplinaNome: data.disciplinaNome,
                turmaNome: data.turmaNome,
                escolaNome: data.escolaNome,
                trimestre: data.trimestre,
                dataCriacao: data.dataCriacao?.toDate?.()?.toISOString() || null
            }
        };

    } catch (error) {
        console.error('Erro ao buscar plano:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Erro ao buscar plano.');
    }
});

/**
 * Deleta um plano
 */
exports.deletarPlano = onCall({
    timeoutSeconds: 60,
    memory: '512MB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
    }

    const { planoId } = request.data;

    if (!planoId) {
        throw new HttpsError('invalid-argument', 'ID do plano não fornecido.');
    }

    const db = getFirestore();

    try {
        const docRef = db.collection('planos_aula_ia').doc(planoId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            throw new HttpsError('not-found', 'Plano não encontrado.');
        }

        const data = docSnap.data();

        if (data.professorUid !== request.auth.uid) {
            throw new HttpsError('permission-denied', 'Você não tem permissão para excluir este plano.');
        }

        await docRef.delete();

        return {
            sucesso: true,
            mensagem: 'Plano excluído com sucesso!'
        };

    } catch (error) {
        console.error('Erro ao deletar plano:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Erro ao deletar plano.');
    }
});

/**
 * Salva um modelo de planejamento da escola
 */
exports.salvarModeloPlanejamento = onCall({
    timeoutSeconds: 60,
    memory: '512MB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
    }

    const { escolaId, escolaNome, nomeModelo, conteudo } = request.data;

    if (!escolaId || !escolaNome || !nomeModelo || !conteudo) {
        throw new HttpsError('invalid-argument', 'Dados incompletos para salvar o modelo.');
    }

    const db = getFirestore();

    try {
        const payload = {
            escolaId,
            escolaNome,
            nomeModelo,
            conteuido: conteudo,
            professorUid: request.auth.uid,
            dataCriacao: FieldValue.serverTimestamp(),
            atualizadoEm: FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('modelos_planejamento').add(payload);

        return {
            sucesso: true,
            id: docRef.id,
            mensagem: 'Modelo de planejamento salvo com sucesso!'
        };

    } catch (error) {
        console.error('Erro ao salvar modelo:', error);
        throw new HttpsError('internal', error.message || 'Erro ao salvar modelo.');
    }
});

/**
 * Lista modelos de planejamento
 */
exports.listarModelosPlanejamento = onCall({
    timeoutSeconds: 60,
    memory: '512MB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
    }

    const { escolaId } = request.data;

    const db = getFirestore();

    try {
        let query = db.collection('modelos_planejamento')
            .where('professorUid', '==', request.auth.uid)
            .orderBy('dataCriacao', 'desc')
            .limit(20);

        if (escolaId) {
            query = db.collection('modelos_planejamento')
                .where('professorUid', '==', request.auth.uid)
                .where('escolaId', '==', escolaId)
                .orderBy('dataCriacao', 'desc')
                .limit(20);
        }

        const snap = await query.get();
        const modelos = [];

        snap.forEach(doc => {
            const data = doc.data();
            modelos.push({
                id: doc.id,
                escolaNome: data.escolaNome,
                nomeModelo: data.nomeModelo,
                conteudoPreview: (data.conteuido || '').substring(0, 200),
                dataCriacao: data.dataCriacao?.toDate?.()?.toISOString() || null
            });
        });

        return {
            sucesso: true,
            modelos: modelos,
            total: modelos.length
        };

    } catch (error) {
        console.error('Erro ao listar modelos:', error);
        throw new HttpsError('internal', error.message || 'Erro ao listar modelos.');
    }
});

/**
 * Busca um modelo de planejamento específico
 */
exports.buscarModeloPlanejamento = onCall({
    timeoutSeconds: 60,
    memory: '512MB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
    }

    const { modeloId } = request.data;

    if (!modeloId) {
        throw new HttpsError('invalid-argument', 'ID do modelo não fornecido.');
    }

    const db = getFirestore();

    try {
        const docSnap = await db.collection('modelos_planejamento').doc(modeloId).get();

        if (!docSnap.exists) {
            throw new HttpsError('not-found', 'Modelo não encontrado.');
        }

        const data = docSnap.data();

        if (data.professorUid !== request.auth.uid) {
            throw new HttpsError('permission-denied', 'Você não tem permissão para acessar este modelo.');
        }

        return {
            sucesso: true,
            modelo: {
                id: docSnap.id,
                escolaNome: data.escolaNome,
                nomeModelo: data.nomeModelo,
                conteudo: data.conteuido,
                dataCriacao: data.dataCriacao?.toDate?.()?.toISOString() || null
            }
        };

    } catch (error) {
        console.error('Erro ao buscar modelo:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Erro ao buscar modelo.');
    }
});

/**
 * Gera um plano de aula com IA
 */
exports.gerarPlanoIA = onCall({
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: '1GB'
}, async (request) => {
    // Verifica autenticação
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
    }

    const { tipo, disciplina, disciplinaId, turma, turmaId, escola, escolaId, aulasSemanais, assunto, trimestre, modelo, modeloPlanejamento } = request.data;

    // Validações
    if (!tipo || !MODELOS_VALIDOS.includes(modelo)) {
        throw new HttpsError('invalid-argument', 'Tipo de plano ou modelo inválido.');
    }
    if (!disciplina || !turma || !aulasSemanais || !assunto) {
        throw new HttpsError('invalid-argument', 'Dados incompletos. Preencha todos os campos obrigatórios.');
    }

    const db = getFirestore();

    try {
        // 1. Busca os PDFs da base pedagógica
        const fontesSnap = await db.collection('base_pedagogica').where('tipo', '==', 'pdf').get();
        const fontes = [];
        const partsArray = [];

        fontesSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.base64) {
                fontes.push({ titulo: data.titulo });
                partsArray.push({
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: data.base64
                    }
                });
                partsArray.push({
                    text: `O documento PDF anexado acima refere-se a: ${data.titulo}. Use como base para o planejamento.`
                });
            }
        });

        // 2. Busca planos existentes da mesma disciplina
        const planosExistentes = await buscarPlanosExistentes(db, disciplinaId, turmaId, 5);

        // 3. Monta o prompt
        const prompt = montarPromptBNCC({
            tipo,
            disciplina,
            turma,
            aulasSemanais,
            assunto,
            trimestre,
            fontes,
            modeloPlanejamento,
            planosExistentes,
            escola
        });

        partsArray.unshift({ text: prompt });

        // 4. Chama a API do Gemini
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${geminiApiKey.value()}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: partsArray }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                    topP: 0.95,
                    topK: 40
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new HttpsError('internal', errData.error?.message || 'Erro na API do Gemini.');
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            throw new HttpsError('internal', 'Resposta inválida da API do Gemini.');
        }

        let textoGerado = data.candidates[0].content.parts[0].text;
        // Remove markdown code blocks se presente
        textoGerado = textoGerado.replace(/^```markdown\n?/i, '').replace(/\n?```$/i, '').trim();

        return {
            sucesso: true,
            texto: textoGerado,
            modelo: modelo,
            fontesUsadas: fontes.map(f => f.titulo),
            planosExistentes: planosExistentes.length
        };

    } catch (error) {
        console.error('Erro na geração do plano:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Erro interno ao gerar plano.');
    }
});
