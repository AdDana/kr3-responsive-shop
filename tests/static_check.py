"""Минимальная проверка HTML-файлов без сторонних библиотек."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import re

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "catalog.html", "product.html", "order.html", "contacts.html"]
errors = []


class InspectHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


for name in PAGES:
    path = ROOT / name
    doc = InspectHTML()
    doc.feed(path.read_text(encoding="utf-8"))
    tags = doc.tags
    heads = [(tag, a) for tag, a in tags if tag == "link" and a.get("rel") == "stylesheet"]
    css = [a.get("href") for _, a in heads]
    if css != ["css/style.css", "css/responsive.css"]:
        errors.append(f"{name}: неверный порядок CSS: {css}")
    if not any(t == "meta" and a.get("name") == "viewport" and "width=device-width" in a.get("content", "") for t, a in tags):
        errors.append(f"{name}: отсутствует корректный viewport")
    if sum(t == "h1" for t, _ in tags) != 1:
        errors.append(f"{name}: нужен ровно один h1")
    if not any(t == "main" and a.get("id") == "main-content" for t, a in tags):
        errors.append(f"{name}: нет main#main-content")
    if not any(t == "nav" and a.get("aria-label") == "Основная навигация" for t, a in tags):
        errors.append(f"{name}: нет семантической навигации")
    if not any(t == "a" and a.get("href") == "#main-content" for t, a in tags):
        errors.append(f"{name}: нет skip-link")
    ids = {a.get("id") for _, a in tags if a.get("id")}
    for _, a in tags:
        if a.get("id") and sum(other.get("id") == a["id"] for _, other in tags) > 1:
            errors.append(f"{name}: дублирован id {a['id']}")
        if "for" in a and a["for"] not in ids:
            errors.append(f"{name}: label указывает на несуществующий id {a['for']}")
    for tag, attrs in tags:
        if tag == "img" and (not attrs.get("alt") or "src" not in attrs):
            errors.append(f"{name}: изображение без alt/src")
        if tag in ("img", "script", "link", "source"):
            refs = []
            if tag == "img":
                refs.append(attrs.get("src", ""))
            if tag == "script":
                refs.append(attrs.get("src", ""))
            if tag == "link" and attrs.get("rel") == "stylesheet":
                refs.append(attrs.get("href", ""))
            if tag == "source":
                refs.extend(re.split(r"\s*,\s*", attrs.get("srcset", "")))
            for ref in refs:
                relative = ref.strip().split()[0] if ref.strip() else ""
                if relative and not urlsplit(relative).scheme and not (ROOT / relative).is_file():
                    errors.append(f"{name}: не найден ресурс {relative}")
        if tag == "a":
            href = attrs.get("href", "")
            if href and not href.startswith(("#", "tel:", "mailto:", "http:", "https:")):
                target = unquote(urlsplit(href).path)
                if not (ROOT / target).is_file():
                    errors.append(f"{name}: не найдена страница {target}")
    labels = {a.get("for") for t, a in tags if t == "label"}
    for tag, a in tags:
        if tag in ("input", "select", "textarea") and a.get("type") not in ("hidden", "checkbox", "radio"):
            if a.get("id") not in labels:
                errors.append(f"{name}: нет label у {a.get('id')}")

styles = (ROOT / "css/responsive.css").read_text(encoding="utf-8")
for required in ("@media (min-width: 640px)", "@media (min-width: 768px)",
                 "@media (min-width: 960px)", "object-fit: contain", "max-width: 100%"):
    if required not in styles:
        errors.append(f"responsive.css: нет {required}")
if "bootstrap" in styles.lower():
    pass  # Упоминание Bootstrap в комментарии допустимо, подключение — нет.

if errors:
    print("ОШИБКИ:")
    print("\n".join(f"- {error}" for error in errors))
    raise SystemExit(1)
print(f"OK: {len(PAGES)} страниц, изображения, ссылки, стили, viewport, h1, alt и подписи")
