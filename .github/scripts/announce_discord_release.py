#!/usr/bin/env python3

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


NIVRYN_COLOR = 0x1ED8FF
NIVRYN_AVATAR_URL = "https://nivryn-client.web.app/nivryn-logo.png"
MAX_EMBED_DESCRIPTION = 3500
WEBHOOK_PREFIXES = (
    "https://discord.com/api/webhooks/",
    "https://canary.discord.com/api/webhooks/",
    "https://ptb.discord.com/api/webhooks/",
)


def env(name, default=""):
    return os.environ.get(name, default).strip()


def is_true(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def load_event():
    event_path = env("GITHUB_EVENT_PATH")
    if not event_path or not os.path.isfile(event_path):
        return {}
    with open(event_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def github_release(repository, release_tag):
    tag = str(release_tag or "").strip()
    if not tag or tag.lower() == "latest":
        endpoint = f"https://api.github.com/repos/{repository}/releases/latest"
    else:
        endpoint = f"https://api.github.com/repos/{repository}/releases/tags/{urllib.parse.quote(tag, safe='')}"

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Nivryn-GitHub-Releases/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = env("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(endpoint, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Could not load GitHub release {tag or 'latest'} (HTTP {error.code}): {response_body[:300]}"
        ) from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach GitHub Releases: {error.reason}") from None


def context_from_release(release, repository):
    tag = str(release.get("tag_name") or "").strip()
    version = re.sub(r"^[vV]", "", tag) or "Unknown"
    return {
        "test_mode": False,
        "version": version,
        "title": str(release.get("name") or tag or f"Nivryn {version}").strip(),
        "notes": str(release.get("body") or "").strip(),
        "url": str(release.get("html_url") or f"https://github.com/{repository}/releases").strip(),
        "channel": "Preview" if release.get("prerelease") else "Stable",
        "published_at": str(release.get("published_at") or "").strip(),
        "assets": [
            {
                "name": str(asset.get("name") or "Download"),
                "url": str(asset.get("browser_download_url") or ""),
            }
            for asset in release.get("assets", [])
            if isinstance(asset, dict) and asset.get("browser_download_url")
        ],
        "repository": repository,
    }


def release_context():
    event_name = env("GITHUB_EVENT_NAME")
    event = load_event()
    repository = env("GITHUB_REPOSITORY", "trxpworks/FlowClient")

    if event_name == "release" and isinstance(event.get("release"), dict):
        return context_from_release(event["release"], repository)

    if not is_true(env("TEST_MODE", "false")):
        context = context_from_release(github_release(repository, env("RELEASE_TAG", "latest")), repository)
        notes_override = env("NOTES_OVERRIDE")
        if notes_override:
            context["notes"] = notes_override
        return context

    version = env("TEST_VERSION", "0.0.0-test")
    return {
        "test_mode": True,
        "version": version,
        "title": f"Nivryn {version}",
        "notes": env("TEST_NOTES", "Test announcement from the Nivryn GitHub workflow."),
        "url": f"https://github.com/{repository}/releases",
        "channel": "Workflow test",
        "published_at": datetime.now(timezone.utc).isoformat(),
        "assets": [],
        "repository": repository,
    }


def summarize_markdown(markdown):
    lines = []
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("```"):
            continue
        line = re.sub(r"^#{1,6}\s+", "", line)
        lines.append(line)
        if len(lines) >= 6:
            break
    summary = "\n".join(lines).strip()
    if not summary:
        return "A new Nivryn release is ready to download."
    if len(summary) > 900:
        summary = summary[:897].rstrip() + "..."
    return summary


def split_markdown(markdown, limit=MAX_EMBED_DESCRIPTION):
    text = markdown.strip() or "No detailed changelog was provided."
    chunks = []
    remaining = text
    while len(remaining) > limit:
        split_at = remaining.rfind("\n\n", 0, limit)
        if split_at < limit // 2:
            split_at = remaining.rfind("\n", 0, limit)
        if split_at < limit // 2:
            split_at = remaining.rfind(" ", 0, limit)
        if split_at < 1:
            split_at = limit
        chunks.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


def asset_links(assets):
    links = []
    for asset in assets[:4]:
        safe_name = asset["name"].replace("[", "").replace("]", "")
        links.append(f"[{safe_name}]({asset['url']})")
    return "\n".join(links)


def with_wait_query(webhook_url):
    parsed = urllib.parse.urlsplit(webhook_url)
    query = urllib.parse.parse_qs(parsed.query)
    query["wait"] = ["true"]
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(query, doseq=True), parsed.fragment)
    )


def validate_webhook(name, value):
    if not value:
        raise RuntimeError(f"Missing GitHub Actions secret: {name}")
    if not value.startswith(WEBHOOK_PREFIXES):
        raise RuntimeError(f"{name} is not a valid Discord webhook URL.")


def post_webhook(name, webhook_url, payload, dry_run):
    if dry_run:
        print(f"\n--- {name} payload ---")
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return

    validate_webhook(name, webhook_url)
    request = urllib.request.Request(
        with_wait_query(webhook_url),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Nivryn-GitHub-Releases/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response.read()
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Discord rejected {name} with HTTP {error.code}: {response_body[:500]}") from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Discord for {name}: {error.reason}") from None


def main():
    context = release_context()
    dry_run = is_true(env("DRY_RUN", "false"))
    announcement_webhook = env("DISCORD_ANNOUNCEMENTS_WEBHOOK")
    changelog_webhook = env("DISCORD_CHANGELOG_WEBHOOK")
    role_id = env("DISCORD_UPDATE_ROLE_ID")
    role_ping = role_id if role_id.isdigit() and not context["test_mode"] else ""
    prefix = "[TEST] " if context["test_mode"] else ""
    timestamp = context["published_at"] or datetime.now(timezone.utc).isoformat()

    announcement_fields = [
        {"name": "Channel", "value": context["channel"], "inline": True},
        {"name": "Download", "value": f"[Open the GitHub release]({context['url']})", "inline": True},
    ]
    downloads = asset_links(context["assets"])
    if downloads:
        announcement_fields.append({"name": "Release files", "value": downloads, "inline": False})

    announcement_payload = {
        "username": "Nivryn Updates",
        "avatar_url": NIVRYN_AVATAR_URL,
        "content": f"<@&{role_ping}>" if role_ping else "",
        "allowed_mentions": {"parse": [], "roles": [role_ping] if role_ping else []},
        "embeds": [
            {
                "title": f"{prefix}Nivryn {context['version']} is now available",
                "url": context["url"],
                "description": summarize_markdown(context["notes"]),
                "color": NIVRYN_COLOR,
                "fields": announcement_fields,
                "footer": {"text": "Nivryn"},
                "timestamp": timestamp,
            }
        ],
    }
    post_webhook("DISCORD_ANNOUNCEMENTS_WEBHOOK", announcement_webhook, announcement_payload, dry_run)

    chunks = split_markdown(context["notes"])
    for index, chunk in enumerate(chunks, start=1):
        part_label = f" - Part {index}/{len(chunks)}" if len(chunks) > 1 else ""
        changelog_payload = {
            "username": "Nivryn Changelog",
            "avatar_url": NIVRYN_AVATAR_URL,
            "allowed_mentions": {"parse": []},
            "embeds": [
                {
                    "title": f"{prefix}Nivryn {context['version']} changelog{part_label}",
                    "url": context["url"],
                    "description": chunk,
                    "color": NIVRYN_COLOR,
                    "footer": {"text": f"{context['channel']} release"},
                    "timestamp": timestamp,
                }
            ],
        }
        post_webhook("DISCORD_CHANGELOG_WEBHOOK", changelog_webhook, changelog_payload, dry_run)

    summary_path = env("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            action = "Built Discord payloads for" if dry_run else "Posted"
            summary.write(f"## Discord release announcement\n\n{action} Nivryn `{context['version']}`.\n")

    print(f"\nDiscord release automation completed for Nivryn {context['version']}.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
