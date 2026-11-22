"""Validate the authoring files and build classic scripts for Pages and file://."""
import argparse
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "game"
ROLES = ("witness", "self")
MODES = {"white", "yellow", "orange", "red"}
ID = re.compile(r"[a-z0-9][a-z0-9-]*\Z")
MARK = re.compile(r"\[\[([^\[\]]+)\]\]")
MEDIA = {"voice": ("src", "transcript"), "video": ("src", "poster", "caption"),
         "image": ("src", "alt"), "sticker": ("src", "alt"), "document": ("src", "file", "alt")}


class StoryLoader(yaml.SafeLoader):
    def construct_mapping(self, node, deep=False):
        result = super().construct_mapping(node, deep)
        if len(result) != len(node.value):
            raise ValueError(f"Repeated YAML key on line {node.start_mark.line + 1}")
        return result


def require(ok, message):
    if not ok:
        raise ValueError(message)


def load(folder, file):
    try:
        return yaml.load((folder / file).read_text("utf8"), Loader=StoryLoader)
    except (ValueError, yaml.YAMLError) as error:
        raise ValueError(f"{file}: {error}") from error


def marked(text):
    require(isinstance(text, str) and text.strip(), "Expected non-empty text")
    rest = MARK.sub("", text)
    require("[[" not in rest and "]]" not in rest and len(MARK.findall(text)) <= 1,
            f"Invalid highlight in {text}")
    return MARK.findall(text)


def asset(path, folder, output):
    require(isinstance(path, str), "Expected a media file path")
    if path.startswith("media/"):
        base = folder
        target = OUTPUT / "media" / folder.name / path[6:]
    else:
        require(path.startswith(("./assets/", "assets/")), f"Unknown asset location {path}")
        base = DOCS
        target = DOCS / path
    source = (base / path).resolve()
    require(".." not in Path(path).parts and source.is_relative_to(base.resolve()) and source.is_file(),
            f"Missing or invalid media file {path}")
    if base == folder:
        output[target] = source.read_bytes()
    return "./" + target.relative_to(DOCS).as_posix()


def validate_route(route, messages):
    scenes = route["scenes"]
    require({"start", "calm", "pressure"} <= scenes.keys(), "Missing entry scene")
    require(set(scenes["start"]["choices"]) == {"calm", "pressure"}, "Invalid first takes")
    cues = route["cues"]
    visited = set()
    known_cues = set()

    def walk(step, previous, available):
        require(step in scenes and step not in visited, f"Missing, repeated or cyclic scene {step}")
        visited.add(step)
        node = scenes[step]
        require(ID.fullmatch(step) and node["mode"] in MODES, f"{step}: invalid scene ID or attention level")
        rows = node["messages"]
        require(rows and len(set(rows)) == len(rows), f"{step}: empty or repeated message")
        review = node.get("review")
        if review:
            require(review["effect"] and review["signals"] and set(review["signals"]) <= available,
                    f"{step}: review refers to a cue outside the player's path")
            if "repair" in review:
                require(review["repair"] in node.get("choices", {}) and review.get("recovery"),
                        f"{step}: missing recovery choice")
        visible = set(available)
        for row in rows:
            require(row in messages, f"{step}: unknown message {row}")
            message = messages[row]
            media = message.get("media", {})
            phrase = message.get("text") or media.get("transcript") or media.get("caption")
            ref = step + "/" + row
            if ref in cues:
                require(phrase and marked(phrase) and cues[ref], f"{ref}: missing marked phrase or explanation")
                visible.add(ref)
                known_cues.add(ref)
        choice_ref = step + "/@choice"
        if choice_ref in cues:
            require(previous and marked(scenes[previous]["choices"][step]) and cues[choice_ref], choice_ref)
            known_cues.add(choice_ref)
            visible.add(choice_ref)
        if "reaction" in node:
            rx = node["reaction"]
            require(rx["from"] in rows and rx["through"] in rows and rows.index(rx["from"]) <= rows.index(rx["through"])
                    and rx["summary"], f"{step}: invalid reaction interval")
        if "outcome" in node:
            kind, headline = node["outcome"]
            require(kind in {"positive", "negative", "mixed", "open"} and headline and node["note"]
                    and not node.get("choices"), f"{step}: invalid ending")
            return
        require(node.get("choices") and (step == "start" or node.get("question")), f"{step}: no way forward")
        for target, label in node["choices"].items():
            marked(label)
            walk(target, step, visible)

    walk("start", None, set())
    require(visited == scenes.keys(), f"Unreachable scenes: {set(scenes) - visited}")
    require(known_cues == cues.keys(), f"Unknown cue locations: {set(cues) - known_cues}")


def script(name, data):
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return f"// Generated by scripts/build_stories.py\nconst {name} = {body};\n".encode()


def build():
    output, catalog = {}, []
    for folder in sorted((ROOT / "stories").iterdir()):
        if not folder.is_dir():
            continue
        try:
            meta = load(folder, "story.yaml")
            require(ID.fullmatch(folder.name) and meta["id"] == folder.name, "Invalid story ID")
            require(meta["title"] and meta["place"] and set(meta["roles"]) == set(ROLES), "Incomplete catalog entry")
            cast = set(meta["cast"])
            for role in meta["roles"].values():
                require(role["name"] in cast and role["intro"] and role["viewpoint"], "Incomplete role")
            for channel in meta["channels"].values():
                require(channel["kind"] in {"group", "private", "voice", "scene"}
                        and (channel["kind"] == "scene" or channel["title"]), "Invalid channel")
            if "article" in meta:
                require(re.fullmatch(r"\./[a-z-]+\.html", meta["article"]) and (DOCS / meta["article"]).is_file(),
                        "Medical article missing")
            messages = load(folder, "messages.yaml")
            for key, msg in messages.items():
                require(ID.fullmatch(key) and msg["speaker"] in cast | {"Ты", "Система", "Ремарка"}, key)
                require("channel" not in msg or msg["channel"] in meta["channels"], f"{key}: unknown channel")
                for people in msg.get("reactions", {}).values():
                    require(set(people) <= cast, f"{key}: unknown reactor")
                require(("text" in msg) != ("media" in msg), f"{key}: supply text or media")
                if "text" in msg:
                    marked(msg["text"])
                else:
                    media = msg["media"]
                    require(media["kind"] in MEDIA and all(media.get(k) for k in MEDIA[media["kind"]]), key)
                    for prop in ("transcript", "caption", "description"):
                        if prop in media:
                            marked(media[prop])
                    for prop in ("src", "poster", "file", "html", "captions"):
                        if prop in media:
                            media[prop] = asset(media[prop], folder, output)
                    if "captions" in media:
                        # Browsers block file:// text tracks even beside a local video.
                        path = DOCS / media["captions"]
                        data = output[path] if path in output else path.read_bytes()
                        media["captionsText"] = data.decode("utf-8-sig")
                        require(re.match(r"^WEBVTT(?:[ \t]|[\r\n]|$)", media["captionsText"]),
                                f"{key}: expected WebVTT subtitles")
            routes = {}
            for role in ROLES:
                try:
                    routes[role] = load(folder, role + ".yaml")
                    validate_route(routes[role], messages)
                except (KeyError, ValueError, TypeError) as error:
                    raise ValueError(f"{role}: {error}") from error
            output[OUTPUT / "stories" / (folder.name + ".js")] = script("storyData", {
                "id": folder.name, "channels": meta["channels"], "messages": messages, "routes": routes})
            catalog.append({k: v for k, v in meta.items() if k not in ("cast", "channels")})
        except (KeyError, OSError, ValueError, TypeError) as error:
            raise ValueError(f"{folder.name}: {error}") from error
    require(catalog, "Empty catalog")
    catalog.sort(key=lambda s: (s.get("order", 9999), s["id"]))
    output[OUTPUT / "catalog.js"] = script("allStories", catalog)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the checked-in site without writing files")
    args = parser.parse_args()
    output = build()
    # Only these directories contain disposable compiler output.
    obsolete = {p for d in ("stories", "media") for p in (OUTPUT / d).rglob("*") if p.is_file()} - output.keys()
    changed = [p for p, data in output.items() if not p.exists() or p.read_bytes() != data]
    if args.check:
        require(not obsolete and not changed, f"Rebuild with python scripts/build_stories.py: {changed or obsolete}")
    else:
        for path in changed:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(output[path])
        for path in obsolete:
            path.unlink()
    print(f"Validated {len(list((ROOT / 'stories').glob('*/story.yaml')))} stories")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        sys.exit(str(exc))
