# 🌾 Agricultural FFV Q&A Generator

Production-ready Python tooling for generating **Formatted-Fact-Validated (FFV)** question-answer pairs in the agricultural domain using Large Language Models (LLMs).

## 📋 Overview

This repository provides tools to:

- **Generate FFVs**: Create structured, domain-classified Q&A summaries from expert agricultural knowledge
- **Use multiple LLM providers**: Support for Anthropic Claude and OpenAI-compatible APIs (including self-hosted models)
- **Batch processing**: Asynchronous batch processing for efficient large-scale FFV generation
- **Domain-specific angles**: Pre-defined angle taxonomy covering 13 agricultural domains
- **Production-ready deployment**: Full CI/CD pipeline, security scanning, and monitoring

## 🎯 Features

- **Multi-provider support**: Anthropic Claude and OpenAI-compatible endpoints
- **Asynchronous batch processing**: Efficient processing of large datasets
- **Domain classification**: Automatic domain detection using LLMs
- **Angle-based summarization**: Generate summaries focused on specific agricultural angles
- **MongoDB integration**: Read from and write to MongoDB collections
- **Comprehensive logging**: Detailed logging for debugging and monitoring
- **Error handling**: Graceful error recovery and retry mechanisms
- **Security**: Environment-based credential management, no hardcoded secrets

## 📁 Project Structure

```
jobs/
├── src/                      # Source code module
│   ├── __init__.py
│   └── domain_angles.py      # Domain and angle definitions
├── scripts/                  # Executable scripts
│   ├── generate_ffvs.py      # Main FFV generation script
│   └── benchmark_minimax.py  # Benchmark script for local models
├── tests/                    # Unit tests
├── docs/                     # Documentation
├── .env.example              # Example environment configuration
├── .gitignore                # Git ignore rules
├── requirements.txt          # Python dependencies
├── pyproject.toml            # Python project configuration
└── .github/
    └── workflows/            # CI/CD workflows
```

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- MongoDB (local or Atlas)
- API keys for LLM providers (Anthropic, OpenAI, or compatible)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/jobs.git
cd jobs
```

2. **Create virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your API keys and MongoDB connection string
```

5. **Verify setup**
```bash
python scripts/generate_ffvs.py --help
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...      # Anthropic API key
MONGO_URI=mongodb+srv://...       # MongoDB connection string

# Optional (with defaults)
MONGO_DB=agriai
CLAUDE_MODEL=claude-sonnet-4-5
BATCH_POLL_INTERVAL_SECONDS=30
BATCH_MAX_WAIT_HOURS=24
LOG_LEVEL=INFO
```

### For Self-Hosted Models (Minimax)

```bash
MINIMAX_BASE_URL=https://your-endpoint.com/
MINIMAX_API_KEY=your-api-key
MINIMAX_MODEL=MiniMax-M3
```

## 📖 Usage

### Generate FFVs (Main Script)

```bash
# Basic usage - generate FFVs from 10 random approved answers
python scripts/generate_ffvs.py --limit 10

# Dry run - validate without writing to database
python scripts/generate_ffvs.py --limit 10 --dry-run

# Resume failed batch
python scripts/generate_ffvs.py --resume-batch-id <batch_id>

# Custom batch tag
python scripts/generate_ffvs.py --limit 50 --batch-tag "production-run-2024"

# Export samples to CSV
python scripts/generate_ffvs.py --limit 10 --export samples.csv
```

### Benchmark Local Models

```bash
# Benchmark Minimax model performance
python scripts/benchmark_minimax.py --limit 100 --workers 4

# Custom worker count
python scripts/benchmark_minimax.py --limit 50 --workers 8

# Verbose logging
python scripts/benchmark_minimax.py --limit 10 --log-level DEBUG
```

## 🧪 Testing

```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_generate_ffvs.py -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html
```

## 🔒 Security

### Secret Management

- **Never commit `.env`** - It's in `.gitignore`
- **Rotate credentials regularly** - Especially if exposed
- **Use environment variables** - All secrets should come from environment
- **Audit API keys** - Regularly review and clean up old keys

### Security Best Practices

1. Use secret scanning tools in CI/CD
2. Implement least-privilege access for MongoDB
3. Use read-only credentials where possible
4. Monitor API usage for anomalies

## 🔄 CI/CD Pipeline

The project includes GitHub Actions workflows for:

- **CI**: Python linting, type checking, and testing
- **Security**: Dependency scanning and secret detection
- **Quality**: Code coverage enforcement

### Workflows

- `ci.yml` - Continuous integration pipeline
- `security.yml` - Security scanning and auditing

## 📊 Monitoring & Logging

### Log Levels

Set via `LOG_LEVEL` environment variable:
- `DEBUG` - Detailed debugging information
- `INFO` - General operational information
- `WARNING` - Warning messages
- `ERROR` - Error messages

### Log Files

Generated logs:
- `ffv_generation.log` - FFV generation logs
- `minimax_benchmark.log` - Benchmark logs

## 🐛 Troubleshooting

### Common Issues

**MongoDB Connection Failed**
- Verify `MONGO_URI` is correct
- Check network connectivity
- Ensure IP whitelist in MongoDB Atlas

**API Rate Limiting**
- Reduce worker count
- Increase `RATE_LIMIT_COOLDOWN_S`
- Use batch processing for large workloads

**Out of Memory**
- Reduce `--limit` value
- Process in smaller batches
- Increase system RAM

## 📝 Documentation

Detailed documentation available in `docs/`:
- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Agricultural domain experts for domain taxonomy
- Anthropic for Claude API
- OpenAI for GPT models
- MongoDB for database infrastructure

## 📧 Contact

For questions, issues, or contributions, please:
- Open an issue on GitHub
- Contact the development team

## 🔗 Related Links

- [Anthropic Documentation](https://docs.anthropic.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Python Logging Documentation](https://docs.python.org/3/library/logging.html)

---

**Version**: 1.0.0  
**Last Updated**: 2024