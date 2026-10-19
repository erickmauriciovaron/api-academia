import json
from pathlib import Path

from app import catalog
from app.config import get_settings


def test_frontend_catalog_json_in_sync():
    """El prerender SEO usa frontend/seo/catalog.json: debe coincidir con catalog.py.
    Si falla: python -m app.cli export-catalog ../frontend/seo/catalog.json"""
    path = Path(__file__).resolve().parents[2] / "frontend" / "seo" / "catalog.json"
    exported = json.loads(path.read_text(encoding="utf-8"))["products"]
    current = json.loads(json.dumps(catalog.public_catalog(), default=str))
    assert exported == current


def test_sitemap_and_robots(client):
    r = client.get("/sitemap.xml", headers={"host": "suite.ejemplo.com", "x-forwarded-proto": "https"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/xml")
    body = r.text
    assert "<loc>https://suite.ejemplo.com/p/venceya</loc>" in body
    assert "<loc>https://suite.ejemplo.com/en/p/licencialens</loc>" in body
    assert 'hreflang="es"' in body and body.count("<url>") == 22
    rb = client.get("/robots.txt", headers={"host": "suite.ejemplo.com", "x-forwarded-proto": "https"}).text
    assert "Disallow: /app/" in rb and "Sitemap: https://suite.ejemplo.com/sitemap.xml" in rb


def test_catalog_exposes_analytics(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "analytics_ga4_id", "G-TEST123")
    monkeypatch.setattr(get_settings(), "ads_meta_pixel_id", "123456789012345")
    monkeypatch.setattr(get_settings(), "ads_linkedin_partner_id", "7654321")
    a = client.get("/api/public/catalog").json()["analytics"]
    assert (a["ga4_id"], a["meta_pixel_id"], a["linkedin_partner_id"]) == ("G-TEST123", "123456789012345", "7654321")
