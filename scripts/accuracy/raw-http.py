"""Public HTML probe using Chrome TLS and BeautifulSoup, with no login or private API."""
import sys, json, time
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse
from curl_cffi import requests
from bs4 import BeautifulSoup
if "--live" not in sys.argv:
    raise SystemExit("Public HTTP probes require --live")
out = Path(".accuracy/raw-http")
out.mkdir(parents=True, exist_ok=True)
query = "white fitted camisole top"
targets = [
    ("depop", "https://www.depop.com/search/?q=" + quote(query), "/products/"),
    ("grailed", "https://www.grailed.com/shop?query=" + quote(query), "/listings/"),
    ("ebay", "https://www.ebay.com/sch/i.html?_nkw=" + quote(query), "/itm/"),
]

def search_products(soup, name, url, marker):
    products, seen = [], set()
    for link in soup.select("a[href]"):
        if marker not in link["href"]:
            continue
        target = urlparse(urljoin(url, link["href"]))
        if target.scheme != "https" or target.hostname not in {name + ".com", "www." + name + ".com"}:
            continue
        canonical = target._replace(query="", fragment="").geturl()
        images = link.select("img[src]")
        image = next((i for i in images if "/P0." in i["src"]), images[0] if images else None)
        if image is None or canonical in seen:
            continue
        title = link.get("aria-label") or image.get("alt")
        src = image.get("src")
        if not title or not src or urlparse(src).scheme != "https":
            continue
        if name == "ebay" and ("ebayimg.com" not in urlparse(src).hostname or len(target.path.split("/")[-1]) < 10):
            continue
        seen.add(canonical)
        products.append({"title": title, "imageUrl": src, "productUrl": canonical, "source": name, "retrievalProvider": "raw-http:" + name})
        if len(products) >= 12:
            break
    return products

for name, url, marker in targets:
    path = out / (name + ".json")
    if path.exists():
        cached = json.loads(path.read_text())
        html_path = out / (name + ".html")
        if html_path.exists():
            cached["products"] = search_products(BeautifulSoup(html_path.read_text(), "html.parser"), name, url, marker)
            path.write_text(json.dumps(cached, indent=2))
        print(json.dumps({"source": name, "cachedProducts": len(cached["products"])}), flush=True)
        continue
    start = time.time()
    result = {"source": name, "query": query, "method": "curl_cffi Chrome TLS + BeautifulSoup public HTML", "attempts": [], "products": []}
    for profile in ["chrome", "safari"]:
        try:
            response = requests.get(url, impersonate=profile, timeout=25)
            soup = BeautifulSoup(response.text, "html.parser")
            result["attempts"].append({"profile": profile, "status": response.status_code, "characters": len(response.text), "title": soup.title.get_text() if soup.title else None})
            if response.status_code != 200:
                continue
            (out / (name + ".html")).write_text(response.text)
            scripts = []
            for tag in soup.select('script[type="application/json"],script[type="application/ld+json"]'):
                try:
                    data = json.loads(tag.get_text())
                    scripts.append({"id": tag.get("id"), "data": data})
                except ValueError:
                    pass
            result["embeddedData"] = scripts
            links = list(dict.fromkeys(urljoin(url, a["href"]) for a in soup.select("a[href]") if marker in a["href"]))
            result["listingLinks"] = links[:12]
            result["products"] = search_products(soup, name, url, marker)
            for link in links[:2]:
                if urlparse(link).hostname != urlparse(url).hostname:
                    continue
                detail = requests.get(link, impersonate=profile, timeout=25)
                detail_soup = BeautifulSoup(detail.text, "html.parser")
                def meta(prop):
                    tag = detail_soup.find("meta", attrs={"property": prop})
                    return tag.get("content") if tag else None
                title, image = meta("og:title"), meta("og:image")
                if detail.status_code == 200 and title and image and urlparse(image).scheme == "https":
                    result.setdefault("detailProducts", []).append({"title": title, "imageUrl": image, "productUrl": link, "source": name, "retrievalProvider": "raw-http:" + name})
            break
        except Exception as error:
            result["attempts"].append({"profile": profile, "error": str(error)})
    result["elapsedMs"] = round((time.time() - start) * 1000)
    path.write_text(json.dumps(result, indent=2))
    print(json.dumps({k: result[k] for k in ["source", "attempts", "products"]}), flush=True)
