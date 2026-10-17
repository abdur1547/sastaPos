import { buildEnvironment } from "./environment.generated";

export const environment = {
  production: true,
  ...buildEnvironment,
};
