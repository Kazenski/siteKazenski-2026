export const palavrasBloqueadas = [
    "otário", "imbecil", "idiota", "burro", "mané", "palhaço", 
    "retardado", "demente", "babaca", "ridículo", "lixo", "nojento", 
    "corno", "canalha", "vagabundo", "safado", "desgraçado", 
    "porra", "merda", "burro", "buceta", "caralho", "fdp", "vsf", "vtnc"
    // Adicione mais palavras aqui conforme precisar
];

// NOVO: Retorna uma lista com as palavras proibidas que foram encontradas
export function encontrarPalavrasBloqueadas(texto) {
    if (!texto) return [];
    const textoLimpo = texto.toLowerCase().replace(/[\W_]+/g, ' ').trim();
    const encontradas = [];
    
    palavrasBloqueadas.forEach(palavra => {
        const regex = new RegExp(`\\b${palavra.replace(/\*/g, '[a-zA-Z]*')}\\b`, 'g');
        if (regex.test(textoLimpo)) {
            encontradas.push(palavra);
        }
    });
    return encontradas;
}

// Mantemos esta para compatibilidade, caso use em outro lugar
export function validarConteudo(texto) {
    return encontrarPalavrasBloqueadas(texto).length > 0;
}