import io
from pathlib import Path

import qrcode
from pypdf import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

_MARGIN = 20


def _calc_position(position: str, page_w: float, page_h: float, size: int) -> tuple[float, float]:
    """Return (x, y) in PDF user-space (origin = bottom-left)."""
    positions: dict[str, tuple[float, float]] = {
        "top-left":     (_MARGIN, page_h - size - _MARGIN),
        "top-right":    (page_w - size - _MARGIN, page_h - size - _MARGIN),
        "bottom-left":  (_MARGIN, _MARGIN),
        "bottom-right": (page_w - size - _MARGIN, _MARGIN),
        "center":       ((page_w - size) / 2, (page_h - size) / 2),
    }
    return positions.get(position, positions["bottom-right"])


def make_qr_image(data: str, size: int = 100) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def insert_qr_into_pdf(
    source_path: str,
    output_path: str,
    qr_data: str,
    position: str = "bottom-right",
    size: int = 100,
) -> str:
    qr_bytes = make_qr_image(qr_data, size)
    reader = PdfReader(source_path)
    writer = PdfWriter()

    for page in reader.pages:
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)
        x, y = _calc_position(position, w, h, size)

        packet = io.BytesIO()
        c = canvas.Canvas(packet, pagesize=(w, h))
        c.drawImage(
            ImageReader(io.BytesIO(qr_bytes)),
            x, y,
            width=size,
            height=size,
            mask="auto",
        )
        c.save()
        packet.seek(0)
        overlay = PdfReader(packet)
        page.merge_page(overlay.pages[0])
        writer.add_page(page)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        writer.write(f)
    return output_path
