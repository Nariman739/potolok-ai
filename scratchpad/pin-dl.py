# Скачать оригинал картинки пина Pinterest: python3 -I pin-dl.py <папка> <префикс> <ссылки…>
# Короткая pin.it → канонический /pin/<id>/ (страница «/sent/» отдаёт заглушку);
# картинка пина — самый частый хэш i.pinimg.com на странице, берём /originals/, иначе /1200x/.
import re, sys, os, urllib.request
from collections import Counter
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
out, prefix, links = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs(out, exist_ok=True)
n = len([f for f in os.listdir(out) if f.startswith(prefix)])
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read(), r.geturl()
for link in links:
    try:
        _, final = get(link)
        m = re.search(r"/pin/(\d+)", final)
        if not m: print("NO PIN ID", link, final); continue
        page = get(f"https://www.pinterest.com/pin/{m.group(1)}/")[0].decode("utf-8", "ignore")
        hashes = Counter(re.findall(r'i\.pinimg\.com/(?:\d+x|originals)/([a-f0-9]{2}/[a-f0-9]{2}/[a-f0-9]{2}/[a-f0-9]{32})\.(jpg|jpeg|png|webp)', page))
        if not hashes: print("NO IMG", link); continue
        (h, ext), _ = hashes.most_common(1)[0]
        data = None
        for size in ("originals", "1200x", "736x"):
            try:
                data, _ = get(f"https://i.pinimg.com/{size}/{h}.{ext}"); break
            except Exception: continue
        if not data: print("DL FAIL", link); continue
        n += 1
        path = os.path.join(out, f"{prefix}-{n:02d}.{ 'png' if ext=='png' else 'jpg'}")
        open(path, "wb").write(data)
        print("OK", path, len(data))
    except Exception as e:
        print("ERR", link, e)
