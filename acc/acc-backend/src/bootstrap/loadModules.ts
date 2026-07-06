import fs from 'fs/promises';
import path from 'path';
import { Container, ContainerModule } from 'inversify';
import { useContainer } from 'routing-controllers';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { appConfig } from '#root/config/app.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let container: Container | null = null;

interface LoadedModuleResult {
  controllers: Function[];
  validators: Function[];
}

export async function loadAppModules(
  moduleName: string,
): Promise<LoadedModuleResult> {
  const isAll = moduleName === 'all';
  let modulesDir;
  if (appConfig.isProduction || appConfig.isStaging) {
    modulesDir = path.resolve('./build/modules');
  } else {
    modulesDir = path.resolve('./src/modules');
  }
  const files = await fs.readdir(modulesDir);

  let controllers: Function[] = [];
  let validators: Function[] = [];
  const allContainerModules: ContainerModule[] = [];

  for (const file of files) {
    // Skip non-directory files
    const stats = await fs.stat(path.join(modulesDir, file));
    if (!stats.isDirectory()) continue;

    const modulePath = `../modules/${file}/index.js`;
    const moduleExports = await import(modulePath);

    const controllerExportKey = `${file}ModuleControllers`;
    const validatorExportKey = `${file}ModuleValidators`;
    const containerModulesKey = `${file}ContainerModules`;

    const setupFunctionKey = `setup${file[0].toUpperCase()}${file.slice(
      1,
    )}Container`;

    if (isAll) {
      controllers.push(...(moduleExports[controllerExportKey] || []));
      validators.push(...(moduleExports[validatorExportKey] || []));
      
      // Handle container modules directly if exported
      if (moduleExports[containerModulesKey]) {
        allContainerModules.push(...moduleExports[containerModulesKey]);
      } else {
        // Build Inversify container bindings manually for modules that don't export them as array
        if (file === 'plivo') {
          allContainerModules.push(moduleExports.plivoContainerModule);
        } else if (file === 'acc-agent') {
          const accAgentModule = new ContainerModule(options => {
            options.bind(moduleExports.AccAgentController).toSelf().inSingletonScope();
            options.bind(Symbol.for('AccAgentService')).to(moduleExports.AccAgentService).inSingletonScope();
          });
          allContainerModules.push(accAgentModule);
        } else if (file === 'user') {
          const userModule = new ContainerModule(options => {
            options.bind(moduleExports.UserController).toSelf().inSingletonScope();
            options.bind(Symbol.for('UserService')).to(moduleExports.UserService).inSingletonScope();
          });
          allContainerModules.push(userModule);
        }
      }
    }
  }

  if (isAll) {
    const uniqueModules = Array.from(new Set(allContainerModules));
    container = new Container();
    await container.load(...uniqueModules);
    
    // Load root shared container
    const { sharedContainerModule } = await import('../container.js');
    await container.load(sharedContainerModule);

    const inversifyAdapter = new InversifyAdapter(container);
    useContainer(inversifyAdapter);
  }

  return { controllers, validators };
}

export const getContainer = (): Container => {
  if (!container) {
    throw new Error(
      'Container not initialized. Call loadAppModules("all") first.',
    );
  }
  return container;
};
