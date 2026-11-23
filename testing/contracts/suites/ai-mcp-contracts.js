import fs from 'fs';
import path from 'path';

/**
 * Suite 2: AI Multi-Agent LangGraph Engine <-> FastMCP Tools & Servers
 * Validates tool signatures, parameter schemas, tool registry, and MCP URLs.
 */
export function runAiMcpSuite(rootDir, record) {
  const mcpDir = path.join(rootDir, 'mcp');
  const aiAgentsDir = path.join(rootDir, 'ai/ajrasakha/agents');

  const readFile = (filePath) => {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  };

  // 1. Tool Registry Coverage Check
  const toolRegistryFile = path.join(aiAgentsDir, 'tool_registry.py');
  const registryContent = readFile(toolRegistryFile);

  const expectedSpecialistTools = [
    { name: 'gdb', desc: 'Golden Dataset Retriever' },
    { name: 'weather', desc: 'Weather Telemetry & Observations' },
    { name: 'soil', desc: 'Soil Health & Fertilizer Calculator' },
    { name: 'daily_price', desc: 'Daily Mandi / Market Prices' },
    { name: 'schemes', desc: 'Government Agri-Schemes Engine' },
    { name: 'chemical_checker', desc: 'Agro-Chemical Safety Checker' },
  ];

  for (const t of expectedSpecialistTools) {
    const isImported = new RegExp(`from.*import.*${t.name}`).test(registryContent);
    const isInList = new RegExp(`tools_list\\s*=\\s*\\[[\\s\\S]*?${t.name}`).test(registryContent);

    if (isImported && isInList) {
      record('AI-MCP-Registry', `Specialist Tool: ${t.name}`, 'PASS', `Registered in main tool node (${t.desc})`);
    } else {
      record('AI-MCP-Registry', `Specialist Tool: ${t.name}`, 'FAIL', `Missing or unregistered tool (${t.desc})`);
    }
  }

  // 2. MCP Server Tool Signature Verifications
  const gdFile = path.join(mcpDir, 'gd.py');
  const gdContent = readFile(gdFile);
  const gdbAgentFile = path.join(aiAgentsDir, 'gdb_agent.py');
  const gdbAgentContent = readFile(gdbAgentFile);

  const hasGdMcpTool = /async\s+def\s+get_context_from_golden_dataset\s*\([^)]*query[^)]*state_code[^)]*crop[^)]*\)/.test(gdContent);
  const hasGdbAgentSchema = /class\s+GDBInput\s*\(BaseModel\):[\s\S]*?rephrased_query:\s*str[\s\S]*?crop:\s*str[\s\S]*?state:\s*str/.test(gdbAgentContent);

  if (hasGdMcpTool && hasGdbAgentSchema) {
    record('AI-MCP-Signature', 'Golden Dataset Tool', 'PASS', 'Schema parity: query, state, and crop synchronized between gd.py and GDBInput');
  } else {
    record('AI-MCP-Signature', 'Golden Dataset Tool', 'FAIL', 'Signature mismatch between gd.py and gdb_agent.py');
  }

  // Weather MCP Server Tool
  const weatherFile = path.join(mcpDir, 'weather.py');
  const weatherContent = readFile(weatherFile);
  const hasWeatherForecast = /async\s+def\s+get_weather_forecast\s*\([^)]*lat[^)]*lon[^)]*\)/.test(weatherContent);
  const hasCurrentWeather = /async\s+def\s+get_current_weather\s*\([^)]*lat[^)]*lon[^)]*\)/.test(weatherContent);

  if (hasWeatherForecast && hasCurrentWeather) {
    record('AI-MCP-Signature', 'Weather MCP Tools', 'PASS', 'Verified get_weather_forecast & get_current_weather with lat/lon parameters');
  } else {
    record('AI-MCP-Signature', 'Weather MCP Tools', 'FAIL', 'Missing expected lat/lon signatures in weather.py');
  }

  // Market & Mandi MCP Tool
  const marketFile = path.join(mcpDir, 'market_mcp.py');
  const marketContent = readFile(marketFile);
  const hasApmcList = /async\s+def\s+get_apmc_list_from_enam\s*\([^)]*state_name[^)]*\)/.test(marketContent);
  const hasTradeData = /async\s+def\s+get_trade_data_list\s*\([^)]*state_name[^)]*apmc_name[^)]*\)/.test(marketContent);

  if (hasApmcList && hasTradeData) {
    record('AI-MCP-Signature', 'Market / eNAM MCP Tools', 'PASS', 'Verified get_apmc_list_from_enam and get_trade_data_list signatures');
  } else {
    record('AI-MCP-Signature', 'Market / eNAM MCP Tools', 'FAIL', 'Signature mismatch in market_mcp.py');
  }

  // PoP MCP Tool
  const popFile = path.join(mcpDir, 'pop.py');
  const popContent = readFile(popFile);
  const hasPopContext = /async\s+def\s+get_context_from_package_of_practices\s*\([^)]*query[^)]*state_code[^)]*\)/.test(popContent);
  const hasReviewerUpload = /async\s+def\s+upload_question_to_reviewer_system\s*\([^)]*question[^)]*state_name[^)]*crop[^)]*details[^)]*\)/.test(popContent);

  if (hasPopContext && hasReviewerUpload) {
    record('AI-MCP-Signature', 'Package of Practices MCP Tools', 'PASS', 'Verified PoP context retriever and upload_question_to_reviewer_system');
  } else {
    record('AI-MCP-Signature', 'Package of Practices MCP Tools', 'FAIL', 'Missing signatures in pop.py');
  }

  // 3. MCP Configuration URL Wire Mapping
  const configFile = path.join(aiAgentsDir, 'config.py');
  const configContent = readFile(configFile);

  const expectedMcpEndpoints = [
    'gdb',
    'weather',
    'soil',
    'enam',
    'agmarknet',
    'reviewer',
    'location',
    'schemes',
    'chemical_checker',
    'daily_price',
  ];

  for (const ep of expectedMcpEndpoints) {
    const hasEndpoint = new RegExp(`["']${ep}["']\\s*:\\s*f?["']http`).test(configContent);
    if (hasEndpoint) {
      record('AI-MCP-Wire', `MCP Config: ${ep}`, 'PASS', `Configured network route in MCP_URLS dictionary`);
    } else {
      record('AI-MCP-Wire', `MCP Config: ${ep}`, 'FAIL', `Missing network endpoint in config.py for ${ep}`);
    }
  }
}
