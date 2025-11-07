#!/usr/bin/env python3
"""
Simple HTTP server for the chatbot interface
"""

import http.server
import socketserver
import os

PORT = 8080

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

if __name__ == "__main__":
    # Change to the directory containing this script
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print("=" * 60)
        print("🌾 Agriculture LLM Chatbot Interface")
        print("=" * 60)
        print(f"Server running at: http://localhost:{PORT}")
        print(f"Open this URL in your browser to use the interface")
        print("=" * 60)
        print("\nMake sure all three models are running:")
        print("  - Dhenu2 on port 8063")
        print("  - Aksara on port 8061")
        print("  - AgriParam on port 8064")
        print("\nPress Ctrl+C to stop the server")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nShutting down server...")

