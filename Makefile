backend-install:
	python -m pip install -r backend/requirements.txt

backend-migrate:
	python backend/manage.py migrate

backend-seed:
	python backend/manage.py seed_data

backend-run:
	python backend/manage.py runserver

celery-worker:
	celery -A payouts worker -l info

celery-beat:
	celery -A payouts beat -l info

frontend-install:
	cd frontend && npm install

frontend-run:
	cd frontend && npm run dev
