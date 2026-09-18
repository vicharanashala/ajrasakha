.PHONY: help install test lint format clean run-ffvs run-benchmark

help:
	@echo "Agricultural FFV Q&A Generator - Make Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make install        Install dependencies"
	@echo "  make test          Run tests"
	@echo "  make lint          Run linting checks"
	@echo "  make format        Format code"
	@echo "  make clean         Clean temporary files"
	@echo "  make run-ffvs      Run FFV generation"
	@echo "  make run-benchmark Run benchmark script"
	@echo "  make setup         Initial setup"
	@echo "  make docker-build  Build Docker image"
	@echo "  make docker-run    Run Docker container"

install:
	pip install -r requirements.txt

test:
	pytest tests/ -v --cov=src --cov-report=term-missing

lint:
	@echo "Running Black..."
	black --check src/ scripts/ || black src/ scripts/
	@echo "Running isort..."
	isort --check-only src/ scripts/ || isort src/ scripts/
	@echo "Running flake8..."
	flake8 src/ scripts/ --max-line-length=100 --extend-ignore=E203,W503
	@echo "Running mypy..."
	mypy src/ scripts/ --ignore-missing-imports

format:
	black src/ scripts/
	isort src/ scripts/

clean:
	rm -rf __pycache__ .pytest_cache .mypy_cache
	rm -rf src/__pycache__ scripts/__pycache__ tests/__pycache__
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	rm -f .batch_state.json failed_qa_ids.json
	rm -f *.log
	rm -rf htmlcov/ .coverage

setup:
	@echo "Setting up development environment..."
	@echo "1. Creating virtual environment..."
	python3 -m venv venv
	@echo "2. Activating virtual environment..."
	@echo "   Run: source venv/bin/activate"
	@echo "3. Installing dependencies..."
	@echo "   Run: make install"
	@echo "4. Copying environment file..."
	@echo "   Run: cp .env.example .env and edit it"
	@echo "5. Installing pre-commit hooks..."
	@echo "   Run: pre-commit install"

run-ffvs:
	python scripts/generate_ffvs.py --help

run-benchmark:
	python scripts/benchmark_minimax.py --help

docker-build:
	docker build -t agriai-ffv-generator:latest .

docker-run:
	docker run -e ANTHROPIC_API_KEY=$$ANTHROPIC_API_KEY \
	           -e MONGO_URI=$$MONGO_URI \
	           -e MONGO_DB=$$MONGO_DB \
	           agriai-ffv-generator:latest

security:
	bandit -r src/ scripts/ -f json -o bandit_report.json
	safety check --file=requirements.txt

docs:
	@echo "Documentation is in docs/ directory:"
	@ls -1 docs/

deploy:
	@echo "Deploying to production..."
	@echo "Make sure to:"
	@echo "1. Update version in pyproject.toml"
	@echo "2. Run tests: make test"
	@echo "3. Run linting: make lint"
	@echo "4. Create git tag: git tag -a v1.0.0 -m 'Release v1.0.0'"
	@echo "5. Push tag: git push origin v1.0.0"
	@echo "6. GitHub Actions will deploy automatically"