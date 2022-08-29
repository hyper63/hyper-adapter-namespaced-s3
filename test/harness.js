// Load .env
import "https://deno.land/x/dotenv@v2.0.0/load.ts";
import { default as appOpine } from "https://x.nest.land/hyper-app-opine@2.2.0/mod.js";
import { default as core } from "https://x.nest.land/hyper@3.3.0/mod.js";
import { cuid } from "https://deno.land/x/cuid@v1.0.0/index.js";

import myAdapter from "../mod.js";
import PORT_NAME from "../port_name.js";

const hyperConfig = {
  app: appOpine,
  adapters: [
    { port: PORT_NAME, plugins: [myAdapter(cuid())] },
  ],
};

core(hyperConfig);
