// Gera ícones PNG simples para a extensão usando Canvas API via Node.js
// Requer: npm install canvas (ou pular e usar os PNGs gerados manualmente)
// Para rodar: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

const iconsDir = path.resolve(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Tenta usar o módulo 'canvas' se disponível, senão gera PNGs mínimos válidos
try {
  const { createCanvas } = require('canvas');

  [16, 48, 128].forEach((size) => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Fundo azul
    ctx.fillStyle = '#1a56db';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.2);
    ctx.fill();

    // Letra R branca
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(size * 0.6)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R', size / 2, size / 2);

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
    console.log(`✓ icon${size}.png`);
  });
} catch {
  // Fallback: PNG 1x1 pixel transparente válido (placeholder funcional)
  // O Chrome aceita qualquer PNG válido como ícone
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  [16, 48, 128].forEach((size) => {
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), PNG_1x1);
    console.log(`✓ icon${size}.png (placeholder 1x1)`);
  });

  console.log('\nDica: instale o pacote "canvas" para ícones reais:');
  console.log('  pnpm add -D canvas');
}
