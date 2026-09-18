# Architecture

## Overview

The Agricultural FFV Q&A Generator is built with a modular architecture designed for scalability, maintainability, and production readiness.

## System Components

### 1. Source Code (`src/`)

Contains the core domain logic and data structures:

- `domain_angles.py`: Defines the agricultural domain taxonomy with 13 domains and their associated angles
- `__init__.py`: Package initialization and exports

### 2. Scripts (`scripts/`)

Contains executable scripts for FFV generation:

- `generate_ffvs.py`: Main script for generating FFVs using Anthropic Claude
- `benchmark_minimax.py`: Benchmarking script for self-hosted models

### 3. Configuration

Environment-based configuration using `.env` files:

- `.env.example`: Template with all configuration options
- `.env`: Local secrets (git-ignored)

## Data Flow

```
┌─────────────────┐
│   MongoDB       │
│   Q&A Pairs     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Domain         │
│  Classification │
│  (LLM Pre-call) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Angle          │
│  Selection      │
│  (LLM Pre-call) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Batch Request  │
│  Submission     │
│  (Anthropic     │
│   Message       │
│   Batches API)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Batch Result   │
│  Collection     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  FFV Document   │
│  Generation     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MongoDB        │
│  FFV Collection │
└─────────────────┘
```

## Domain Taxonomy

The system uses a hierarchical domain structure:

1. **Soil Health and Nutrient Management** (19 angles)
2. **Irrigation and Water Management** (14 angles)
3. **Pest and Disease Management** (22 angles)
4. **Crop Production and Management** (20 angles)
5. **Weather and Climate** (18 angles)
6. **Harvesting and Post-Harvest** (16 angles)
7. **Marketing and Economics** (15 angles)
8. **Government Schemes and Subsidies** (12 angles)
9. **Organic Farming** (20 angles)
10. **Technology and Innovation** (15 angles)
11. **Livestock and Animal Husbandry** (19 angles)
12. **Training and Advisory** (16 angles)
13. **Rural Infrastructure** (17 angles)

## Security Architecture

### Secret Management

- All secrets loaded from environment variables
- `.env` file excluded from version control
- Clear warning comments in `.env.example`
- No hardcoded credentials in source code

### API Security

- API keys rotated regularly
- Least-privilege access for MongoDB
- HTTPS-only communication
- Request timeout and retry mechanisms

## Error Handling

### Retry Logic

- Configurable retry attempts for HTTP requests
- Exponential backoff for rate limiting
- Graceful degradation on partial failures

### Error Recovery

- Batch state persistence for resume capability
- Failed ID tracking for later retry
- Detailed error logging and reporting

## Performance Optimization

### Batch Processing

- Asynchronous batch API usage
- Configurable batch size limits
- Parallel worker support for benchmarks

### Caching

- MongoDB connection pooling
- Reusable HTTP sessions

## Monitoring and Logging

### Log Levels

- DEBUG: Detailed execution tracing
- INFO: Operational milestones
- WARNING: Recoverable issues
- ERROR: Failures requiring attention

### Log Destinations

- File: Persistent log files
- Console: Real-time monitoring
- Structured format for parsing

## Scalability Considerations

### Horizontal Scaling

- Stateless script design
- Multiple batch processing support
- Distributed MongoDB support

### Vertical Scaling

- Configurable worker counts
- Batch size tuning
- Memory-efficient streaming

## Future Enhancements

- Support for additional LLM providers
- Real-time streaming responses
- Webhook notifications
- Advanced analytics dashboard