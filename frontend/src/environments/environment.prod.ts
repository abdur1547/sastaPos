import { env } from "process";

export const environment = {
  production: true,
  apiBaseUrl: env.API_BASE_URL
};
