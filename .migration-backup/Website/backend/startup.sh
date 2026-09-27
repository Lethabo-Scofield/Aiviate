#!/usr/bin/env bash
set -e
cd /home/site/wwwroot
python -m pip install --disable-pip-version-check -r requirements.txt
exec gunicorn --bind=0.0.0.0:${PORT:-8000} wsgi:app --workers 2 --timeout 120
