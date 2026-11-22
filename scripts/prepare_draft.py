"""Compare an editor draft to the current sources. Optionally export a separate YAML folder."""
import argparse
import base64
import difflib
import json
import re
import tempfile
from pathlib import Path
from unittest.mock import patch

import yaml

import build_stories as game


def compiled(raw):
    return json.loads(raw.decode("utf8").split(" = ", 1)[1].rstrip(";\n"))


def current(story_id):
    output = game.build()
    catalog = compiled(output[game.OUTPUT / "catalog.js"])
    meta = next((entry for entry in catalog if entry["id"] == story_id), None)
    if meta:
        return {"meta": meta, "data": compiled(output[game.OUTPUT / "stories" / (story_id + ".js")])}


def yaml_text(value):
    return yaml.safe_dump(value, allow_unicode=True, sort_keys=False, width=1200)


def diff(base, work):
    before = yaml_text(base or {}).splitlines()
    after = yaml_text(work).splitlines()
    return "\n".join(difflib.unified_diff(before, after, "Опубликовано", "Черновик", lineterm=""))


def write_sources(folder, work, files):
    data = work["data"]
    meta = dict(work["meta"])
    cast = {a["name"] for a in meta["roles"].values()}
    messages = json.loads(json.dumps(data["messages"]))
    for msg in messages.values():
        if msg["speaker"] not in ("Ты", "Ремарка", "Система"):
            cast.add(msg["speaker"])
        for people in msg.get("reactions", {}).values():
            cast.update(people)
        media = msg.get("media", {})
        media.pop("captionsText", None)
        for prop in ("src", "poster", "file", "html", "captions"):
            src = media.get(prop, "")
            if not src.startswith("./game/media/"):
                continue
            match = re.fullmatch(r"\./game/media/([a-z0-9-]+)/((?:[\w-]+/)*[\w.-]+\.[a-zA-Z0-9]+)", src)
            if not match:
                raise ValueError("Некорректный путь к вложению")
            name = match[2]
            dest = folder / "media" / name
            if src in files:
                encoded = re.fullmatch(r"data:(?:image/(?:png|jpeg|webp)|audio/(?:mpeg|ogg));base64,([A-Za-z0-9+/]+=*)", files[src])
                if not encoded:
                    raise ValueError("Неподдерживаемое вложение")
                binary = base64.b64decode(encoded[1], validate=True)
            else:
                binary = (game.DOCS / src).read_bytes()
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists() and dest.read_bytes() != binary:
                raise ValueError(f"Два разных файла с именем {name}")
            dest.write_bytes(binary)
            media[prop] = "media/" + name
    meta.update(cast=sorted(cast), channels=data["channels"])
    for filename, contents in {"story": meta, "messages": messages, **data["routes"]}.items():
        if filename not in ("story", "messages", *game.ROLES):
            raise ValueError("Неизвестная роль")
        (folder / (filename + ".yaml")).write_text(yaml_text(contents), encoding="utf8")


def prepare(package, destination=None):
    if package.get("format") != "stop-kadr-draft/1":
        raise ValueError("Неизвестный формат черновика")
    work, base = package["work"], package["base"]
    sid = work["meta"]["id"]
    if not game.ID.fullmatch(sid) or work["data"]["id"] != sid:
        raise ValueError("Некорректное имя истории")
    published = current(sid)
    if base != published:
        raise ValueError("Опубликованная история изменилась или имя занято. Сверьте версии перед переносом.")
    if destination and (destination.exists() or destination.resolve().is_relative_to(game.ROOT.resolve())):
        raise ValueError("Выберите новую пустую папку за пределами проекта.")
    with tempfile.TemporaryDirectory() as scratch:
        root = Path(scratch)
        folder = root / "stories" / sid
        folder.mkdir(parents=True)
        write_sources(folder, work, package.get("files", {}))
        # Validate in isolation against the same media and guides as the actual game.
        with patch.object(game, "ROOT", root):
            game.build()
        if destination:
            import shutil
            shutil.copytree(folder, destination)
    return diff(base, work)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("draft", type=Path)
    parser.add_argument("--export", type=Path, help="new directory outside the project")
    args = parser.parse_args()
    try:
        print(prepare(json.loads(args.draft.read_text("utf8")), args.export) or "Совпадает с опубликованной историей.")
    except (KeyError, ValueError, TypeError, OSError) as exc:
        parser.exit(1, str(exc) + "\n")
