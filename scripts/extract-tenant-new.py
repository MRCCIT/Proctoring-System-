from pathlib import Path

p = Path(
    r"C:\Users\savej\.cursor\projects\d-Procotring-servicea-app\agent-transcripts\4e99eda2-da6e-43b5-af6b-562d3ba8489c\compaction\segment_000.md"
)
text = p.read_text(encoding="utf-8", errors="ignore")

marker = 'apps\\\\super-admin-portal\\\\app\\\\tenants\\\\new\\\\page.tsx","contents":"'
idx = text.find(marker)
print("marker idx", idx)
if idx < 0:
    marker = 'tenants\\\\new\\\\page.tsx","contents":"'
    idx = text.find(marker)
    print("alt marker", idx)
if idx < 0:
    raise SystemExit("marker not found")

i = idx + len(marker)
chars = []
while i < len(text):
    ch = text[i]
    if ch == "\\":
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if nxt == "n":
            chars.append("\n")
            i += 2
            continue
        if nxt == "t":
            chars.append("\t")
            i += 2
            continue
        if nxt == "r":
            chars.append("\r")
            i += 2
            continue
        if nxt == '"':
            chars.append('"')
            i += 2
            continue
        if nxt == "\\":
            chars.append("\\")
            i += 2
            continue
        if nxt == "u" and i + 5 < len(text):
            hexv = text[i + 2 : i + 6]
            try:
                chars.append(chr(int(hexv, 16)))
                i += 6
                continue
            except ValueError:
                pass
        chars.append(nxt)
        i += 2
        continue
    if ch == '"':
        break
    chars.append(ch)
    i += 1

contents = "".join(chars)
out = Path(r"d:\Procotring-servicea-app\scripts\_recovered_tenant_new.tsx")
out.write_text(contents, encoding="utf-8")
print("wrote", len(contents), "ends with quote at", i)
print("has maxSessions", "maxSessions" in contents)
print("has feature", "feature" in contents.lower() or "ai_face" in contents)
print("---HEAD---")
print(contents[:700])
print("---TAIL---")
print(contents[-700:])
