#!/bin/bash
# macOS launcher — double-click in Finder (you may need: right-click → Open the first time).
# Starts the local server and opens the app in your browser. Ctrl+C in the window to stop.
cd "$(dirname "$0")"
python3 server.py
