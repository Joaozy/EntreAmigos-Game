import fitz  # PyMuPDF
import os

# --- CONFIGURAÇÕES ---
# Lista dos seus PDFs (garanta que eles estão na mesma pasta deste script)
PDF_FILES = [
    "DIXIT_10_OVERVIEW.pdf", 
    "DIXIT_9_OVERVIEW.pdf", 
    "DIXIT_5_OVERVIEW.pdf"
]

# Pasta onde as cartas serão salvas (caminho do seu projeto)
OUTPUT_DIR = os.path.join("client", "public", "dixit_cards")

# Garante que a pasta existe
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

print(f"🚀 Iniciando extração de cartas para: {OUTPUT_DIR}")

card_counter = 101
min_width = 200  # Filtra imagens muito pequenas (ícones, logos)
min_height = 200

for pdf_file in PDF_FILES:
    if not os.path.exists(pdf_file):
        print(f"⚠️  Arquivo não encontrado: {pdf_file} (Pulando...)")
        continue
    
    print(f"\n📂 Lendo arquivo: {pdf_file}...")
    
    try:
        doc = fitz.open(pdf_file)
        
        for page_index in range(len(doc)):
            page = doc[page_index]
            image_list = page.get_images(full=True)
            
            # Se a página tiver muitas imagens, pode ser um catálogo. 
            # Se tiver 1 imagem grande, pode ser a carta.
            
            for img_index, img in enumerate(image_list):
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                ext = base_image["ext"]  # png, jpeg, etc.
                
                # Filtrar imagens pequenas (logos, ícones de texto)
                try:
                    # Tenta pegar dimensoes
                    import io
                    from PIL import Image
                    image_obj = Image.open(io.BytesIO(image_bytes))
                    width, height = image_obj.size
                    
                    if width < min_width or height < min_height:
                        continue # Pula se for muito pequeno
                        
                except ImportError:
                    # Se não tiver PIL instalado, ignora filtro de tamanho e salva tudo
                    pass
                except Exception as e:
                    print(f"Erro ao verificar dimensões: {e}")

                # Salvar imagem
                # Forçamos .jpg para facilitar a compatibilidade com o front-end
                filename = f"card_{card_counter}.jpg"
                filepath = os.path.join(OUTPUT_DIR, filename)
                
                # Se for PNG, converte para JPG se tiver PIL, senão salva como extraiu
                if ext != "jpeg" and ext != "jpg":
                     try:
                        from PIL import Image
                        image_obj = Image.open(io.BytesIO(image_bytes))
                        rgb_im = image_obj.convert('RGB')
                        rgb_im.save(filepath, quality=90)
                     except:
                        # Fallback: salva com a extensão original se der erro
                        filepath = os.path.join(OUTPUT_DIR, f"card_{card_counter}.{ext}")
                        with open(filepath, "wb") as f:
                            f.write(image_bytes)
                else:
                    with open(filepath, "wb") as f:
                        f.write(image_bytes)

                print(f"  ✅ Carta {card_counter} extraída (Pág {page_index+1})")
                card_counter += 1
                
        doc.close()

    except Exception as e:
        print(f"❌ Erro ao processar {pdf_file}: {e}")

print(f"\n✨ CONCLUÍDO! Total de cartas extraídas: {card_counter - 1}")
print("Nota: Verifique a pasta. Se houver imagens 'lixo' (logos, textos), apague manualmente e renomeie se necessário.")