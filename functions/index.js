const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

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
