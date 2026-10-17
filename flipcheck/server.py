"""Loopback-only HTTP application, with same-origin mutation protection."""
import argparse
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import sys
from urllib.parse import urlparse

from .config import ROOT, load_env
from .domain import local_date
from .service import App
from .store import Store

def create_server(app, port=8765):
    token = secrets.token_urlsafe(32)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            # Do not log request bodies, query strings, listing content, or secrets.
            pass

        def reply(self, data, status=200, content_type="application/json; charset=utf-8"):
            body = json.dumps(data, allow_nan=False).encode() if content_type.startswith("application/json") else data
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.end_headers()
            self.wfile.write(body)

        def valid_host(self):
            return self.headers.get("Host") in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}

        def do_GET(self):
            if not self.valid_host():
                return self.reply({"error": "Invalid local host."}, 403)
            path = urlparse(self.path).path
            if path == "/":
                port_value = os.getenv("FLIPCHECK_WEB_PORT", "3030")
                web_port = int(port_value) if port_value.isdigit() and 1 <= int(port_value) <= 65535 else 3030
                self.send_response(307)
                self.send_header("Location", f"http://127.0.0.1:{web_port}")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if path == "/api/state":
                return self.reply(app.state() | {"csrf_token": token})
            if path == "/api/health":
                return self.reply(app.health(refresh=True))
            if path == "/api/export":
                state = app.state()
                return self.reply({k: state[k] for k in ("settings", "watchlists", "listings", "comparisons", "scans")})
            if path == "/api/templates/listings":
                return self.reply({"listings": [], "instructions": "Add original seller title/description, stable external_id or ebay.com.au item URL, asking_price, inbound_shipping (null if unknown), currency=AUD, country=AU, buying_format=fixed_price. Choose one search when importing."})
            if path == "/api/templates/comparisons":
                return self.reply({"comparisons": [], "instructions": "Supply genuine completed transactions, category, brand, exact model, condition, material profile attributes, source/reference, verified/actual_price_known, sold_at/collected_at, currency=AUD, country=AU, sold_price and shipping. No example sales are preloaded."})
            return self.reply({"error": "Not found."}, 404)

        def do_POST(self):
            if not self.valid_host():
                return self.reply({"error": "Invalid local host."}, 403)
            origin = self.headers.get("Origin")
            if origin and origin not in {f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}"}:
                return self.reply({"error": "Cross-origin requests are not allowed."}, 403)
            if not hmac.compare_digest(self.headers.get("X-FlipCheck-Token", ""), token):
                return self.reply({"error": "Refresh this local page before making changes."}, 403)
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 2_000_000:
                    raise ValueError("Upload a JSON document smaller than 2 MB.")
                if not self.headers.get("Content-Type", "").startswith("application/json"):
                    raise ValueError("Content-Type must be application/json.")
                data = json.loads(self.rfile.read(length), parse_constant=lambda v: (_ for _ in ()).throw(ValueError("Non-finite JSON numbers are not supported.")))
                if not isinstance(data, dict):
                    raise ValueError("Request body must be a JSON object.")
                path = urlparse(self.path).path
                if path == "/api/watchlists/save":
                    result = app.save_watchlist(data)
                elif path == "/api/watchlists/archive":
                    result = app.archive_watchlist(data.get("id"))
                elif path == "/api/settings":
                    result = app.settings(data)
                elif path == "/api/import/listings":
                    result = app.start("import", rows=data.get("listings"), watchlist_ids=data.get("watchlist_ids"))
                elif path == "/api/import/comparisons":
                    result = app.import_comparisons(data.get("comparisons"))
                elif path == "/api/scan":
                    result = app.start("live", watchlist_ids=data.get("watchlist_ids"))
                elif path == "/api/analyse":
                    result = app.start("analyse", listing_id=data.get("id"))
                elif path == "/api/decision":
                    result = app.decision(data.get("id"), data.get("decision"))
                elif path == "/api/correct":
                    result = app.correct(data.get("id"), data)
                else:
                    return self.reply({"error": "Not found."}, 404)
                return self.reply(result)
            except (ValueError, KeyError, TypeError) as exc:
                return self.reply({"error": str(exc)}, 400)
            except Exception:
                return self.reply({"error": "Operation failed. Existing local data is preserved."}, 500)

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    load_env()
    parser = argparse.ArgumentParser(description="FlipCheck local deal scout")
    parser.add_argument("--port", type=int, default=int(os.getenv("FLIPCHECK_PORT", "8765")))
    parser.add_argument("--data-dir", default=os.getenv("FLIPCHECK_DATA_DIR", str(ROOT / ".data")))
    args = parser.parse_args()
    data_dir = Path(args.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    data_dir.chmod(0o700)
    app = App(Store(data_dir / "flipcheck.sqlite3"))
    server = create_server(app, args.port)
    print(f"FlipCheck → http://127.0.0.1:{server.server_port}", flush=True)
    print("Local only. No telemetry. Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
