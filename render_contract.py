from pathlib import Path

import pypdfium2 as pdfium


source = Path(r"C:\Users\JUAND\Documents\CamScanner 10-09-2026 19.17.pdf")
output = Path("tmp/pdfs/aguacate-contract")
output.mkdir(parents=True, exist_ok=True)

document = pdfium.PdfDocument(source)
for page_number in range(len(document)):
    page = document[page_number]
    bitmap = page.render(scale=2.5)
    bitmap.to_pil().save(output / f"page-{page_number + 1}.png")
