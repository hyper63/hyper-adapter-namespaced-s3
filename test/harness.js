// Load .env
import 'https://deno.land/std@0.178.0/dotenv/load.ts'
import { cuid } from 'https://deno.land/x/cuid@v1.0.0/index.js'

import { default as appOpine } from 'https://x.nest.land/hyper-app-opine@2.3.0/mod.js'
import { default as core } from 'https://x.nest.land/hyper@3.4.2/mod.js'

import myAdapter from '../mod.js'
import PORT_NAME from '../port_name.js'

const hyperConfig = {
  app: appOpine,
  adapters: [
    { port: PORT_NAME, plugins: [myAdapter(cuid())] },
  ],
}

core(hyperConfig)
