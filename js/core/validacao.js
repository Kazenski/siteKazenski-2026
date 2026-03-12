
export const palavrasBloqueadas = [
    "otário", "imbecil", "idiota", "burro", "mané", "palhaço", 
    "retardado", "demente", "babaca", "ridículo", "lixo", "nojento", 
    "corno", "canalha", "vagabundo", "safado", "desgraçado", 
    "porra", "merda", "burro", "buceta", "caralho", "fdp", "vsf", "vtnc"
    // Adicione mais palavras aqui conforme precisar
];

export function validarConteudo(texto) {
    if (!texto) return false;
    const textoLimpo = texto.toLowerCase().replace(/[\W_]+/g, ' ').trim();
    
    return palavrasBloqueadas.some(palavra => {
        // Usa regex para encontrar a palavra exata (evita bloquear "escutar" por causa de "cutar", etc)
        const regex = new RegExp(`\\b${palavra.replace(/\*/g, '[a-zA-Z]*')}\\b`, 'g');
        return regex.test(textoLimpo);
    });
}