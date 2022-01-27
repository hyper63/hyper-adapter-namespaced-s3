// Load .env
import "https://deno.land/x/dotenv@v2.0.0/load.ts";

import { appOpine, core, cuid } from "../dev_deps.js";
import myAdapter from "../mod.js";
import PORT_NAME from "../port_name.js";

const hyperConfig = {
  app: appOpine,
  adapters: [
    { port: PORT_NAME, plugins: [myAdapter(cuid())] },
  ],
};

core(hyperConfig);
