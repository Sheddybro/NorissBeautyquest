#!/usr/bin/env bash
# Run from the uploaded Django project directory inside a PythonAnywhere Bash console.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
if [[ ! -f manage.py || ! -f requirements.txt ]]; then echo 'Run this from the Django project directory.' >&2; exit 1; fi
if [[ ! -f .env ]]; then echo 'ERROR: create .env with production DJANGO_* values first (see PYTHONANYWHERE_AND_APK_DEPLOY.md).' >&2; exit 1; fi
set -a
# shellcheck disable=SC1091
source .env
set +a
if [[ "${DJANGO_DEBUG:-true}" != 'false' ]]; then echo 'ERROR: DJANGO_DEBUG must be false.' >&2; exit 1; fi
if [[ -z "${DJANGO_SECRET_KEY:-}" || "$DJANGO_SECRET_KEY" == development-only* ]]; then echo 'ERROR: set a strong DJANGO_SECRET_KEY.' >&2; exit 1; fi
if [[ "${DJANGO_ALLOWED_HOSTS:-}" != *pythonanywhere.com* ]]; then echo 'ERROR: configure DJANGO_ALLOWED_HOSTS.' >&2; exit 1; fi
if [[ -f .venv/bin/python ]]; then PYTHON=.venv/bin/python; else
  echo 'No .venv found: creating a project-local virtualenv.'
  python3 -m venv .venv
  PYTHON=.venv/bin/python
fi
"$PYTHON" -m pip install -r requirements.txt
"$PYTHON" -m pip check
"$PYTHON" manage.py check --deploy
"$PYTHON" manage.py migrate --plan
read -r -p 'Apply listed migrations to the CURRENT configured database? Type YES: ' reply
if [[ "$reply" != 'YES' ]]; then echo 'Migrations skipped; static collection can still be done manually.'; exit 1; fi
"$PYTHON" manage.py migrate --noinput
"$PYTHON" manage.py collectstatic --noinput
printf '\nDone. Configure PythonAnywhere Web tab WSGI file and reload the web app.\n'
printf 'Project: %s\nVirtualenv: %s/.venv\n' "$PROJECT_DIR" "$PROJECT_DIR"
