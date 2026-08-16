"""Stamp APP_VERSION in www/index.html from the current git commit.

    py -3 tools/stamp_version.py

"Which build are you on?" is the first question any bug report needs, and it is unanswerable
without a version the user can read back. Run this before a deploy.
"""
import io
import os
import re
import subprocess
import sys
import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(BASE, "www", "index.html")


def main():
    rev = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=BASE,
                         capture_output=True, text=True).stdout.strip()
    if not rev:
        sys.stderr.write("not a git checkout, or git is unavailable\n")
        return 1
    stamp = "%s %s" % (datetime.date.today().isoformat(), rev)

    s = io.open(TARGET, encoding="utf-8").read()
    new, n = re.subn(r'const APP_VERSION="[^"]*";', 'const APP_VERSION="%s";' % stamp, s, count=1)
    if n != 1:
        sys.stderr.write("APP_VERSION not found in %s\n" % TARGET)
        return 1
    if new == s:
        print("already at %s" % stamp)
        return 0
    io.open(TARGET, "w", encoding="utf-8", newline="").write(new)
    print("stamped %s" % stamp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
