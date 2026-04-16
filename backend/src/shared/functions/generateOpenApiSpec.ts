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


import fs from 'fs';

import { appConfig } from '../../config/app.js'; // adjust path as needed
import { metadata } from 'reflect-metadata/no-conflict';
import { ValidationMetadata } from 'class-validator/types/metadata/ValidationMetadata.js';
import classTransformer from 'class-transformer';

const defaultMetadataStorageTyped: MetadataStorage =
  (classTransformer as any).defaultMetadataStorage;

function removeInvalidRefs(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeInvalidRefs);
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip key-value if it matches invalid ref conditions
      if (key === '$ref' && (value === '#/components/schemas/Object' || value === '#/components/schemas/Array')) {
        continue;
      }
      // Recursively process children
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

  const appUrl = appConfig.url || 'https://desk.vicharanashala.ai/';
  const parsedUrl = new URL(appUrl);

  if (isDev) {
    // Localhost server
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

    // Configured dev/staging server
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

  // Filter controllers by prefix
  storage.controllers = storage.controllers.filter(
    ctrl =>
      typeof ctrl.route === 'string' &&
      ctrl.route.toLowerCase().startsWith(normalizedPrefix),
  );

  // Collect valid targets (class references)
  const validTargets = new Set(storage.controllers.map(c => c.target));

  // Filter all associated metadata by controller target
  storage.actions = storage.actions.filter(a => validTargets.has(a.target));
}

function getSchemasForValidators(validators: Function[]) {
  const validatorSet = new Set(validators);
  let storage: MetadataStorage = getMetadataStorage();

  const filteredValidationMetadatas: Map<Function, ValidationMetadata[]> = new Map();
  const originalValidationMetadatas = (storage as unknown as any).validationMetadatas as Map<Function, ValidationMetadata[]>;

  for (const [key, value] of originalValidationMetadatas) {
    // Filter validation metadata based on the provided validators
    if (validatorSet.has(key)) {
      filteredValidationMetadatas.set(key, value);
    }
  }

  // Temporarily replace the validation metadata storage
  (storage as any).validationMetadatas = filteredValidationMetadatas;

  // Generate schemas from the filtered validation metadata
  const schemas = validationMetadatasToSchemas({
    refPointerPrefix: '#/components/schemas/',
    classValidatorMetadataStorage: storage,
  });

  // Restore original metadata
  (storage as any).validationMetadatas = originalValidationMetadatas;

  return schemas;
}


export function generateOpenAPISpec(
  routingControllersOptions: RoutingControllersOptions,
  validators: Function[] = [],
) {

  // Get metadata storage
  const storage = getMetadataArgsStorage();

  if (appConfig.module !== 'all') {
    filterMetadataByModulePrefix(appConfig.module);
  }

  // Fix query params with undefined target/types to prevent routing-controllers-openapi crash
  if (storage.params) {
    storage.params = storage.params.map((param: any) => {
      if (param.type === undefined || param.target === undefined) {
        return { ...param, type: String, target: param.target || Object };
      }
      return param;
    });
  }

  let schemas: Record<string, any> = {};
  if (validators.length === 0 || appConfig.module === 'all') {
    // If no specific validators are provided, use all class-validator schemas
    schemas = validationMetadatasToSchemas({
      refPointerPrefix: '#/components/schemas/',
      classTransformerMetadataStorage: defaultMetadataStorageTyped as any
    });
  } else {
    // If specific validators are provided, filter schemas based on them
    schemas = getSchemasForValidators(validators);
  }

  // Create OpenAPI specification
  const spec = routingControllersToSpec(storage, routingControllersOptions, {
    openapi: '3.0.3',
    info: {
      title: 'Ajrasakha API Documentation',
      version: '1.0.0',
      description: 'API documentation for the Ajrasakha platform',
      contact: {
        name: 'Ajrasakha Team',
        email: 'support@ajrasakha.com',
      },
    },

    // tags: [
    //   {
    //     name: 'Authentication',
    //     description: 'Operations for user authentication and authorization',
    //   },
    // ],
    // 'x-tagGroups': [{
    //   name: 'Auth Module',
    //   tags: ['Authentication'],
    // }, {
    //   name: 'Courses Module',
    //   tags: [
    //     'Courses',
    //     'Course Versions',
    //     'Course Modules',
    //     'Course Sections',
    //     'Course Items',
    //   ],
    // }],

    //   tags: [
    //     // Authentication section
    //     {
    //       name: 'Authentication',
    //       description: 'Operations for user authentication and authorization',
    //     },

    //     // Course section and sub-components
    //     {
    //       name: 'Courses',
    //       description: 'Operations related to courses management',
    //       'x-displayName': 'Courses',
    //     },
    //     {
    //       name: 'Course Versions',
    //       description: 'Operations for managing different versions of a course',
    //       'x-displayName': 'Versions',
    //       'x-resourceGroup': 'Courses',
    //     },
    //     {
    //       name: 'Course Modules',
    //       description:
    //         'Operations for managing modules within a course version',
    //       'x-displayName': 'Modules',
    //       'x-resourceGroup': 'Courses',
    //     },
    //     {
    //       name: 'Course Sections',
    //       description:
    //         'Operations for managing sections within a course module',
    //       'x-displayName': 'Sections',
    //       'x-resourceGroup': 'Courses',
    //     },
    //     {
    //       name: 'Course Items',
    //       description:
    //         'Operations for managing individual items within a section',
    //       'x-displayName': 'Items',
    //       'x-resourceGroup': 'Courses',
    //     },

    //     // User management section
    //     {
    //       name: 'User Enrollments',
    //       description: 'Operations for managing user enrollments in courses',
    //     },
    //     {
    //       name: 'User Progress',
    //       description: 'Operations for tracking and managing user progress',
    //     },
    //   ],
    //   // Use Scalar's preferred grouping approach
    tags: [
      {
        name: 'Authentication',
        description: 'Authentication and authorization operations',
      },
      {
        name: 'users',
        description: 'Operations for managing users',
      },
      {
        name: 'questions',
        description: 'Operations for managing questions',
      },
      {
        name: 'Answers',
        description: 'Answer management operations',
      },
      {
        name: 'analytics',
        description: 'Chatbot analytics endpoints',
      },
      {
        name: 'Comments',
        description: 'Comment management operations',
      },
      {
        name: 'contexts',
        description: 'Operations for managing contexts',
      },
      {
        name: 'crops',
        description: 'Operations for managing the crop master list',
      },
      {
        name: 'performance',
        description: 'Operations related to Performance Dashboard',
      },
      {
        name: 'requests',
        description: 'Operations for managing requests',
      },
      {
        name: 'reroute',
        description: 'Reroute operations for questions',
      },
      {
        name: 'Notifications',
        description: 'Operations for managing notifications',
      }
    ],
    'x-tagGroups': [
      {
        name: 'Authentication',
        tags: ['Authentication'],
      },
      {
        name: 'Users',
        tags: ['users'],
      },
      {
        name: 'Q&A System',
        tags: ['questions', 'Answers'],
      },
      {
        name: 'Analytics',
        tags: ['analytics'],
      },
      {
        name: 'Content',
        tags: ['Comments', 'contexts'],
      },
      {
        name: 'Agriculture',
        tags: ['crops'],
      },
      {
        name: 'Performance',
        tags: ['performance'],
      },
      {
        name: 'Requests',
        tags: ['requests'],
      },
      {
        name: 'Reroute',
        tags: ['reroute'],
      },
      {
        name: 'Notifications',
        tags: ['Notifications'],
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
  //   const specLog = JSON.stringify(cleanedSpec, null, 2);
  // const logFile = fs.createWriteStream('openapi-spec.json');
  // logFile.write(specLog);
  // logFile.end();

  return cleanedSpec;
}
