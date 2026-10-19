from xml.sax.saxutils import escape

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse, Response

from .. import catalog, paypal
from ..config import get_settings

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/catalog")
def get_catalog():
    s = get_settings()
    return {
        "products": catalog.public_catalog(),
        "trial_days": s.trial_days,
        "annual_multiplier": catalog.ANNUAL_MULTIPLIER,
        "payments": "paypal" if paypal.enabled() else s.paypal_mode,
        "analytics": {
            "ga4_id": s.analytics_ga4_id,
            "plausible_domain": s.analytics_plausible_domain,
            "plausible_src": s.analytics_plausible_src,
        },
    }


@router.get("/context")
def context(request: Request):
    """Devuelve el producto asociado al dominio (si hay dominios propios configurados)."""
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(":")[0].lower()
    host = host.removeprefix("www.")
    return {"host": host, "product": get_settings().domain_map.get(host)}


# ---------- SEO (fuera de /api: Nginx enruta /sitemap.xml y /robots.txt al backend) ----------
seo = APIRouter(tags=["seo"])


def _site(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    return f"{proto}://{host}"


@seo.get("/sitemap.xml")
def sitemap(request: Request):
    site = _site(request)
    pages = [("", "")] + [(f"/p/{slug}", slug) for slug in catalog.PRODUCTS]
    urls = []
    for path, _ in pages:
        for lang, prefix in (("es", ""), ("en", "/en")):
            loc = f"{site}{prefix}{path}" if (prefix or path) else f"{site}/"
            alt_es = f"{site}{path}" if path else f"{site}/"
            alt_en = f"{site}/en{path}"
            urls.append(
                f"<url><loc>{escape(loc)}</loc>"
                f'<xhtml:link rel="alternate" hreflang="es" href="{escape(alt_es)}"/>'
                f'<xhtml:link rel="alternate" hreflang="en" href="{escape(alt_en)}"/>'
                f'<xhtml:link rel="alternate" hreflang="x-default" href="{escape(alt_es)}"/>'
                f"<changefreq>weekly</changefreq><priority>{'1.0' if not path else '0.8'}</priority></url>"
            )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
        + "".join(urls)
        + "</urlset>"
    )
    return Response(xml, media_type="application/xml")


@seo.get("/robots.txt", response_class=PlainTextResponse)
def robots(request: Request):
    return (
        "User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /api/\nDisallow: /firmar/\n"
        "Disallow: /datos/\nDisallow: /soporte/\nDisallow: /reset\n"
        f"Sitemap: {_site(request)}/sitemap.xml\n"
    )
