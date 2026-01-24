import json
import math
from PIL import Image, ImageDraw, ImageFont

# --- CONFIGURAÇÕES VISUAIS (ESTILO CODENAMES) ---
A4_SIZE = (2480, 3508)      # 300 DPI
CARD_SIZE = (600, 400)      # Tamanho do card
MARGIN = 40                 # Espaço entre cards na folha
CORNER_RADIUS = 20          # Arredondamento dos cantos

# Paleta de Cores
BG_COLOR_A4 = (255, 255, 255)        # Fundo da página (escuro para destacar o corte)
CARD_COLOR = (230, 210, 181)      # Bege/Pardo (Cor do papelão)
BORDER_COLOR = (190, 170, 140)    # Um bege mais escuro para a borda interna
TEXT_BG_COLOR = (255, 255, 255)   # Fundo branco do texto
TEXT_COLOR = (0, 0, 0)            # Texto Preto

def create_stylish_card(text):
    """Cria um card no estilo 'Board Game' (Codenames)."""
    
    # 1. Base do Card (Bege)
    card = Image.new('RGBA', CARD_SIZE, (0, 0, 0, 0)) # Fundo transparente
    draw = ImageDraw.Draw(card)

    # Desenhar o retângulo principal arredondado (Fundo Bege)
    draw.rounded_rectangle(
        [(0, 0), (CARD_SIZE[0]-1, CARD_SIZE[1]-1)], 
        radius=CORNER_RADIUS, 
        fill=CARD_COLOR, 
        outline=(160, 140, 110), 
        width=2
    )

    # 2. Borda Decorativa Interna (Linha fina)
    padding = 15
    draw.rounded_rectangle(
        [(padding, padding), (CARD_SIZE[0]-padding, CARD_SIZE[1]-padding)],
        radius=CORNER_RADIUS - 5,
        outline=BORDER_COLOR,
        width=2
    )

    # 3. Marca d'água / Selo (Canto superior direito)
    stamp_pos = (CARD_SIZE[0] - 100, 40)
    draw.ellipse([stamp_pos, (stamp_pos[0]+60, stamp_pos[1]+60)], outline=BORDER_COLOR, width=2)
    try:
        font_icon = ImageFont.truetype("arial.ttf", 30)
        draw.text((stamp_pos[0]+20, stamp_pos[1]+15), "Op", fill=BORDER_COLOR, font=font_icon)
    except:
        pass

    # 4. Faixa Branca do Texto
    text_box_margin = 25
    text_box_height = 120
    text_box_y = CARD_SIZE[1] - text_box_height - text_box_margin
    
    # Coordenadas da caixa branca original
    x0 = text_box_margin
    y0 = text_box_y
    x1 = CARD_SIZE[0] - text_box_margin
    y1 = CARD_SIZE[1] - text_box_margin
    
    box_coords = [(x0, y0), (x1, y1)]
    
    # --- CORREÇÃO AQUI ---
    # Sombra leve da caixa de texto (desenhada um pouco deslocada +4px)
    draw.rounded_rectangle(
        [(x0 + 4, y0 + 4), (x1 + 4, y1 + 4)], # Coordenadas explícitas
        radius=10, 
        fill=(200, 180, 150)
    )
    
    # Caixa branca por cima da sombra
    draw.rounded_rectangle(box_coords, radius=10, fill=TEXT_BG_COLOR)

    # 5. O Texto (Palavra)
    text = text.upper()
    
    try:
        font = ImageFont.truetype("impact.ttf", 65)
    except IOError:
        try:
            font = ImageFont.truetype("arialbd.ttf", 55)
        except:
            font = ImageFont.load_default()

    # Centralizar texto
    box_center_x = CARD_SIZE[0] / 2
    box_center_y = text_box_y + (text_box_height / 2)

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    draw.text(
        (box_center_x - text_w / 2, box_center_y - text_h / 1.5), 
        text, 
        fill=TEXT_COLOR, 
        font=font
    )
    
    return card

def main():
    # 1. Ler JSON
    try:
        with open('words_codenames.json', 'r', encoding='utf-8') as f:
            palavras = json.load(f)
    except FileNotFoundError:
        print("Erro: Crie um arquivo 'palavras.json' antes.")
        return

    print(f"Carregadas {len(palavras)} palavras. Gerando cards...")
    cards = [create_stylish_card(p) for p in palavras]

    # 2. Configuração do Grid na folha A4
    cols = (A4_SIZE[0] - MARGIN) // (CARD_SIZE[0] + MARGIN)
    rows = (A4_SIZE[1] - MARGIN) // (CARD_SIZE[1] + MARGIN)
    cards_per_page = cols * rows

    # Lista para armazenar as imagens das folhas A4 geradas
    paginas = []

    # 3. Montar Páginas
    num_pages = math.ceil(len(cards) / cards_per_page)
    
    for p_idx in range(num_pages):
        # Cria uma folha em branco
        page = Image.new('RGB', A4_SIZE, BG_COLOR_A4)
        
        for i in range(cards_per_page):
            item_idx = p_idx * cards_per_page + i
            if item_idx >= len(cards):
                break
            
            # Calcular posição X, Y
            col_pos = i % cols
            row_pos = i // cols
            
            x = MARGIN + col_pos * (CARD_SIZE[0] + MARGIN)
            y = MARGIN + row_pos * (CARD_SIZE[1] + MARGIN)
            
            # Colar o card na folha
            page.paste(cards[item_idx], (x, y), cards[item_idx])
        
        # Adiciona a folha pronta na lista
        paginas.append(page)
        print(f"Página {p_idx + 1}/{num_pages} preparada.")

    # 4. Salvar tudo em um único PDF
    if paginas:
        output_filename = "cards_jogo_completo.pdf"
        print(f"Salvando arquivo PDF: {output_filename}...")
        
        # A mágica acontece aqui:
        # Pegamos a primeira página e salvamos, anexando o resto (pages[1:])
        paginas[0].save(
            output_filename, 
            "PDF", 
            resolution=300.0, 
            save_all=True, 
            append_images=paginas[1:]
        )
        print("Sucesso! Pode abrir o PDF.")
    else:
        print("Nenhuma página foi gerada.")

if __name__ == "__main__":
    main()