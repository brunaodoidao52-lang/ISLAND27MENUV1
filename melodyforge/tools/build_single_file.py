"""Builds dist/MelodyForge-ISLAND27.html: the web app with Tone.js, the core and the
interface inlined, so it works as one file (offline, no folders needed).
Usage: python3 tools/build_single_file.py"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'melodyforge-ultimate.html').read_text(encoding='utf-8')


def inline(match):
    src = match.group(1)
    code = (root / src).read_text(encoding='utf-8')
    code = re.sub(r'//# sourceMappingURL=\S+', '', code)
    code = code.replace('</script', '<\\/script')
    return '<script>/* ' + src + ' */\n' + code + '\n</script>'


out_html, count = re.subn(r'<script src="([^"]+)"></script>', inline, html)
assert count == 3, count
out = root / 'dist' / 'MelodyForge-ISLAND27.html'
out.parent.mkdir(exist_ok=True)
out.write_text(out_html, encoding='utf-8')
print(f'{out.relative_to(root)}: {out.stat().st_size // 1024} KB, {count} scripts inlined')
