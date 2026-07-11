import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import {
  getMetadataArgsStorage,
  RoutingControllersOptions,
} from 'routing-controllers';
import {
  getMetadataStorage,
  MetadataStorage
} from 'class-validator';
import { routingControllersToSpec } from 'routing-controllers-openapi';
import { appConfig } from '#root/config/app.js';
import classTransformer from 'class-transformer';
import { ValidationMetadata } from 'class-validator/types/metadata/ValidationMetadata.js';

const defaultMetadataStorageTyped: MetadataStorage =
  (classTransformer as any).defaultMetadataStorage;

function removeInvalidRefs(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeInvalidRefs);
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && (value === '#/components/schemas/Object' || value === '#/components/schemas/Array')) {
        continue;
      }
      newObj[key] = removeInvalidRefs(value);
    }
    return newObj;
  }
  return obj;
}

const getOpenApiServers = () => {
  const servers = [];
  const isDev = appConfig.isDevelopment;
  const isStaging = appConfig.isStaging;
  const isProd = appConfig.isProduction;

  const appUrl = appConfig.url || 'http://localhost:4001';
  const parsedUrl = new URL(appUrl);

  if (isDev) {
    servers.push({
      url: 'http://{host}:{port}',
      description: 'Local Development Server',
      variables: {
        host: {
          default: 'localhost',
          description: 'Localhost for API server',
        },
        port: {
          default: String(appConfig.port),
          description: 'Port for the API server',
        },
      },
    });
    servers.push({
      url: `https://${parsedUrl.hostname}`,
      description: 'Dev Server (Remote)',
    });
  }

  if (isStaging) {
    servers.push({
      url: `https://${parsedUrl.hostname}`,
      description: 'Staging Server',
    });
  }

  if (isProd) {
    servers.push({
      url: `https://${parsedUrl.hostname}`,
      description: 'Production Server',
    });
    servers.push({
      url: appUrl,
      description: 'Production API Server',
    });
  }

  return servers;
};

export function filterMetadataByModulePrefix(modulePrefix: string) {
  const storage = getMetadataArgsStorage();
  const normalizedPrefix = `/${modulePrefix.toLowerCase()}`;

  storage.controllers = storage.controllers.filter(
    ctrl =>
      typeof ctrl.route === 'string' &&
      ctrl.route.toLowerCase().startsWith(normalizedPrefix),
  );

  const validTargets = new Set(storage.controllers.map(c => c.target));
  storage.actions = storage.actions.filter(a => validTargets.has(a.target));
}

function getSchemasForValidators(validators: Function[]) {
  const validatorSet = new Set(validators);
  let storage: MetadataStorage = getMetadataStorage();

  const filteredValidationMetadatas: Map<Function, ValidationMetadata[]> = new Map();
  const originalValidationMetadatas = (storage as unknown as any).validationMetadatas as Map<Function, ValidationMetadata[]>;

  for (const [key, value] of originalValidationMetadatas) {
    if (validatorSet.has(key)) {
      filteredValidationMetadatas.set(key, value);
    }
  }

  (storage as any).validationMetadatas = filteredValidationMetadatas;

  const schemas = validationMetadatasToSchemas({
    refPointerPrefix: '#/components/schemas/',
    classValidatorMetadataStorage: storage,
  });

  (storage as any).validationMetadatas = originalValidationMetadatas;
  return schemas;
}

export function generateOpenAPISpec(
  routingControllersOptions: RoutingControllersOptions,
  validators: Function[] = [],
) {
  const storage = getMetadataArgsStorage();

  if (appConfig.module !== 'all') {
    filterMetadataByModulePrefix(appConfig.module);
  }

  if (storage.params) {
    storage.params = storage.params.map((param: any) => {
      if (param.type === undefined || param.target === undefined) {
        return {...param, type: String, target: param.target || Object};
      }
      return param;
    });
  }

  let schemas: Record<string, any> = {};
  if (validators.length === 0 || appConfig.module === 'all') {
    schemas = validationMetadatasToSchemas({
      refPointerPrefix: '#/components/schemas/',
      classTransformerMetadataStorage: defaultMetadataStorageTyped as any,
    });
  } else {
    schemas = getSchemasForValidators(validators);
  }

  const spec = routingControllersToSpec(storage, routingControllersOptions, {
    openapi: '3.0.3',
    info: {
      title: 'ACC Call Center API Documentation',
      version: '1.0.0',
      description: 'API documentation for the Agricultural Call Center standalone microservice',
      contact: {
        name: 'Annam support',
        email: 'support@annam.ai',
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Authentication and sync operations',
      },
      {
        name: 'users',
        description: 'Operations for managing users and call agents',
      },
      {
        name: 'questions',
        description: 'Questions and ACC Agent HITL operations',
      },
      {
        name: 'farmer',
        description: 'Farmer profiles operations',
      },
      {
        name: 'plivo',
        description: 'Plivo Call webhooks and SMS operations',
      },
      {
        name: 'context',
        description: 'Context lookup operations',
      },
    ],
    'x-tagGroups': [
      {
        name: 'Auth & Sync',
        tags: ['Authentication'],
      },
      {
        name: 'Users & Agents',
        tags: ['users'],
      },
      {
        name: 'Q&A & ACC Agent Flow',
        tags: ['questions'],
      },
      {
        name: 'Farmer Profiles',
        tags: ['farmer'],
      },
      {
        name: 'Plivo Calls',
        tags: ['plivo'],
      },
      {
        name: 'Context metadata',
        tags: ['context'],
      },
    ],
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    servers: getOpenApiServers(),
    security: [
      {
        bearerAuth: [],
      },
    ],
  });

  const cleanedSpec = removeInvalidRefs(spec);
  return cleanedSpec;
}
