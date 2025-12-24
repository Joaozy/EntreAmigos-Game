import fitz  # PyMuPDF
from PIL import Image, ImageOps
import os
import io

# --- CONFIGURAÇÕES ---
PDF_FILES = [
    "cartas_dixit.pdf"
]

OUTPUT_DIR = os.path.join("client", "public", "dixit_cards")
ZOOM = 3  # Qualidade (300%)

# Cria pasta se não existir
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

print(f"🚀 Iniciando Fatiamento Inteligente (Auto-Crop)...")
card_counter = 1

for pdf_file in PDF_FILES:
    if not os.path.exists(pdf_file):
        print(f"⚠️  Arquivo não encontrado: {pdf_file}")
        continue
    
    print(f"\n📄 Processando: {pdf_file}")
    doc = fitz.open(pdf_file)

    for i, page in enumerate(doc):
        # 1. Renderiza a página
        mat = fitz.Matrix(ZOOM, ZOOM)
        pix = page.get_pixmap(matrix=mat)
        img = Image.open(io.BytesIO(pix.tobytes())).convert("RGB")
        
        # 2. AUTO-CROP (A Mágica acontece aqui)
        # Inverte a imagem para preto-no-branco para achar onde tem conteúdo
        inverted = ImageOps.invert(img)
        # Calcula a caixa delimitadora (bbox) ignorando o fundo branco
        bbox = inverted.getbbox()
        
        if bbox:
            # Corta as bordas brancas automaticamente
            img_cropped = img.crop(bbox)
            print(f"  Página {i+1}: Bordas removidas. Tamanho ajustado de {img.size} para {img_cropped.size}")
        else:
            # Se for página em branco, pula
            print(f"  Página {i+1}: Vazia (pulando)")
            continue

        # 3. Prepara para o corte 3x3 na imagem JÁ CORTADA
        width, height = img_cropped.size
        
        # Ignora páginas que não parecem ser de cartas (muito pequenas ou estreitas)
        if width < 500 or height < 500:
            continue

        card_w = width / 3
        card_h = height / 3
        
        # 4. Loop de Fatiamento
        for row in range(3):
            for col in range(3):
                left = col * card_w
                top = row * card_h
                right = left + card_w
                bottom = top + card_h
                
                # Corta a carta individual
                card_img = img_cropped.crop((left, top, right, bottom))
                
                # Salva
                filename = f"card_{card_counter}.jpg"
                filepath = os.path.join(OUTPUT_DIR, filename)
                card_img.save(filepath, quality=95)
                
                card_counter += 1

    doc.close()

print(f"\n✨ SUCESSO! Total de {card_counter - 1} cartas geradas.")
print(f"📁 Verifique a pasta: {OUTPUT_DIR}")