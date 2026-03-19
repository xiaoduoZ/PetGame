# tools/petgame_cli.py
import argparse
import json
import os
from pathlib import Path

import requests

TOKEN_FILE = Path(".petgame_token.json")


def save_token(data: dict):
    TOKEN_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_token() -> str | None:
    if not TOKEN_FILE.exists():
        return None
    data = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    return data.get("access_token")


def get_token(kc_base: str, realm: str, client_id: str, username: str, password: str) -> dict:
    url = f"{kc_base.rstrip('/')}/realms/{realm}/protocol/openid-connect/token"
    resp = requests.post(
        url,
        data={
            "client_id": client_id,
            "username": username,
            "password": password,
            "grant_type": "password",
        },
        timeout=15,
    )
    if resp.status_code != 200:
        raise SystemExit(f"Token request failed: {resp.status_code} {resp.text}")
    return resp.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def call_json(method: str, url: str, token: str, json_body=None):
    resp = requests.request(
        method,
        url,
        headers={**auth_headers(token), "Content-Type": "application/json"},
        json=json_body,
        timeout=15,
    )
    if resp.status_code >= 400:
        raise SystemExit(f"HTTP {resp.status_code}: {resp.text}")
    # 有些接口可能返回空
    if not resp.text.strip():
        return None
    return resp.json()


def main():
    ap = argparse.ArgumentParser(prog="petgame", description="PetGame CLI wrapper")
    ap.add_argument("--kc", default="http://localhost:8080", help="Keycloak base URL")
    ap.add_argument("--realm", default="petgame", help="Keycloak realm")
    ap.add_argument("--client", default="petgame-api", help="Keycloak client_id")
    ap.add_argument("--interaction", default="http://localhost:8001", help="interaction-service base URL")
    ap.add_argument("--pet", default="http://localhost:8002", help="pet-service base URL")

    sub = ap.add_subparsers(dest="cmd", required=True)

    p_login = sub.add_parser("login", help="Login and store token")
    p_login.add_argument("-u", "--username", default="demo")
    p_login.add_argument("-p", "--password", default="demo")

    sub.add_parser("pet", help="Get my pet status")

    p_complete = sub.add_parser("complete", help="Complete an interaction template")
    p_complete.add_argument("template_id", help="e.g. study_25m")

    sub.add_parser("missed", help="Trigger missed check")

    args = ap.parse_args()

    if args.cmd == "login":
        data = get_token(args.kc, args.realm, args.client, args.username, args.password)
        save_token({"access_token": data["access_token"]})
        print("OK: token saved to .petgame_token.json")
        return

    token = load_token()
    if not token:
        raise SystemExit("No token found. Run: python tools/petgame_cli.py login")

    if args.cmd == "pet":
        url = f"{args.pet.rstrip('/')}/api/v1/pet/me"
        print(json.dumps(call_json("GET", url, token), ensure_ascii=False, indent=2))
        return

    if args.cmd == "complete":
        url = f"{args.interaction.rstrip('/')}/api/v1/interactions/complete"
        body = {"template_id": args.template_id}
        print(json.dumps(call_json("POST", url, token, body), ensure_ascii=False, indent=2))
        return

    if args.cmd == "missed":
        url = f"{args.interaction.rstrip('/')}/api/v1/interactions/check-missed"
        print(json.dumps(call_json("POST", url, token), ensure_ascii=False, indent=2))
        return


if __name__ == "__main__":
    main()