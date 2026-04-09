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

// Remove tags HTML de uma string para evitar injeção básica
export function sanitizarInput(texto) {
    if (typeof texto !== 'string') return texto;
    // Remove tags <script> e outras tags HTML
    return texto.replace(/<[^>]*>?/gm, '').trim();
}


//Valida se o e-mail segue um formato seguro
export function validarEmailSeguro(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}