# Imagens da tela de Manutenção

Coloque aqui o arquivo de fundo da página de manutenção.

## Nome e caminho exatos

```
imagens/manutencao/imagem_manutencao.jpg
```

O caminho é referenciado por:

- `index.html` → atributo `data-img` do overlay `#kz-mantencao`
- `style.css` → regra `.kz-mnt__bg`

Se você trocar o nome do arquivo, atualize o atributo `data-img` no `index.html`
(o JavaScript usa esse atributo como fonte da imagem de fundo).

## Observações

- Formato recomendado: `.jpg` (ou `.webp`, que pesa menos).
- Proporção ideal: 1920×1080 ou maior. A imagem recebe `background-size: cover`
  e um véu escuro (`linear-gradient`) por cima para o texto ficar legível.
- Enquanto a imagem não existir, o overlay usa o gradiente do próprio CSS
  (fundo slate-900) — a página de manutenção continua funcionando normalmente.
