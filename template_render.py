"""Render drag-and-drop email design blocks to HTML + plain-text.

A template's `blocks` is a list of dicts, each like:
    {"type": "heading"|"text"|"image"|"button"|"divider",
     "text": "...", "url": "...", "align": "left|center|right",
     "color": "#hex", "size": "small|normal|large"}

Variable placeholders (e.g. {name}) inside text/url fields are substituted
per-lead via messaging_service.render_message.
"""

from messaging_service import render_message

_HEADING_SIZE = {"small": "16px", "normal": "20px", "large": "26px"}


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _align(block: dict) -> str:
    a = block.get("align") or "left"
    return a if a in ("left", "center", "right") else "left"


def render_blocks(blocks: list[dict], lead: dict, settings: dict) -> dict:
    """Return {"html": ..., "text": ...} with variables filled in for `lead`."""
    html_parts: list[str] = []
    text_parts: list[str] = []

    for block in blocks or []:
        btype = block.get("type")
        raw_text = block.get("text") or ""
        text = render_message(raw_text, lead, settings) if raw_text else ""
        url = block.get("url") or ""
        if url:
            url = render_message(url, lead, settings)
        align = _align(block)
        color = block.get("color") or ""

        if btype == "heading":
            size = _HEADING_SIZE.get(block.get("size") or "large", "26px")
            style = f"margin:0 0 12px;font-size:{size};font-weight:700;text-align:{align};"
            if color:
                style += f"color:{color};"
            html_parts.append(f'<h2 style="{style}">{_esc(text)}</h2>')
            text_parts.append(text)
        elif btype == "text":
            body = _esc(text).replace("\n", "<br>")
            style = f"margin:0 0 12px;font-size:14px;line-height:1.5;text-align:{align};"
            if color:
                style += f"color:{color};"
            html_parts.append(f'<p style="{style}">{body}</p>')
            text_parts.append(text)
        elif btype == "image":
            if url:
                html_parts.append(
                    f'<p style="margin:0 0 12px;text-align:{align};">'
                    f'<img src="{_esc(url)}" alt="" style="max-width:100%;border-radius:8px;" /></p>')
                text_parts.append(url)
        elif btype == "button":
            bg = color or "#2563eb"
            html_parts.append(
                f'<p style="margin:0 0 12px;text-align:{align};">'
                f'<a href="{_esc(url) or "#"}" style="background:{bg};color:#ffffff;'
                f'padding:11px 22px;border-radius:6px;text-decoration:none;display:inline-block;'
                f'font-weight:600;font-size:14px;">{_esc(text) or "Click here"}</a></p>')
            text_parts.append(f"{text or 'Click here'}: {url}".strip(": "))
        elif btype == "divider":
            html_parts.append('<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />')
            text_parts.append("----------")

    html = (
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;'
        'max-width:600px;margin:0 auto;">' + "".join(html_parts) + "</div>"
    )
    text = "\n\n".join(p for p in text_parts if p)
    return {"html": html, "text": text}
