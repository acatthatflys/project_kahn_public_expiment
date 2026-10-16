#!/usr/bin/env python3
"""Local server for the Kahn Game visualizer.

Serves the renderer UI and tournament CSV logs so the browser can list
and load games without extra tooling.
"""
from __future__ import annotations

import json
import mimetypes
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
RENDERER = os.path.join(BASE, "renderer")
RESULTS = os.path.join(BASE, "tournament_results")
PORT = int(os.environ.get("KAHN_RENDERER_PORT", "8765"))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path in ("/", "/index.html"):
            return self._send_file(os.path.join(RENDERER, "index.html"), "text/html")
        if path.startswith("/static/"):
            rel = path[len("/static/") :]
            return self._send_file(os.path.join(RENDERER, rel))
        if path == "/api/games":
            return self._list_games()
        if path.startswith("/api/game/"):
            name = path[len("/api/game/") :]
            return self._send_csv(name)

        # fallback: files under renderer/
        candidate = os.path.join(RENDERER, path.lstrip("/"))
        if os.path.isfile(candidate):
            return self._send_file(candidate)
        self.send_error(404, "Not found")

    def _send_file(self, filepath, ctype=None):
        if not os.path.isfile(filepath):
            self.send_error(404)
            return
        if ctype is None:
            ctype, _ = mimetypes.guess_type(filepath)
            ctype = ctype or "application/octet-stream"
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _list_games(self):
        games = []
        if os.path.isdir(RESULTS):
            for name in sorted(os.listdir(RESULTS)):
                if name.endswith(".csv"):
                    games.append({"file": name, "label": pretty_label(name)})
        payload = json.dumps(games).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_csv(self, name):
        name = os.path.basename(name)
        path = os.path.join(RESULTS, name)
        if not os.path.isfile(path):
            self.send_error(404)
            return
        self._send_file(path, "text/csv; charset=utf-8")


def pretty_label(filename: str) -> str:
    base = filename.replace(".csv", "")
    return base.replace("_", " ")


def main():
    os.chdir(BASE)
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Kahn renderer at http://0.0.0.0:{PORT}/")
    print(f"Serving CSVs from {RESULTS}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
