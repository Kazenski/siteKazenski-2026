// Leitor de CSV no navegador (mesmo algoritmo de functions/sql-csv.js).
// Usado para mostrar as colunas da base antes de publicar a prova.

export function lerCsv(texto) {
    const linhas = [];
    let linha = [];
    let campo = '';
    let emAspas = false;
    const s = String(texto ?? '').replace(/^\uFEFF/, '');

    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (emAspas) {
            if (c === '"') {
                if (s[i + 1] === '"') {
                    campo += '"';
                    i++;
                } else {
                    emAspas = false;
                }
            } else {
                campo += c;
            }
        } else if (c === '"') {
            emAspas = true;
        } else if (c === ',') {
            linha.push(campo);
            campo = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && s[i + 1] === '\n') i++;
            linha.push(campo);
            linhas.push(linha);
            linha = [];
            campo = '';
        } else {
            campo += c;
        }
    }
    if (campo !== '' || linha.length > 0) {
        linha.push(campo);
        linhas.push(linha);
    }
    return linhas.filter(l => !(l.length === 1 && l[0] === ''));
}

// Nome de tabela seguro a partir do nome do arquivo (sem extensão).
export function nomeDaTabela(nomeArquivo) {
    const base = String(nomeArquivo || '').replace(/\.csv$/i, '');
    const limpo = base
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!limpo) return 'tabela';
    return /^[0-9]/.test(limpo) ? `t_${limpo}` : limpo;
}
