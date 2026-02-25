import { exit } from "node:process";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
import { setupDirectories } from "@dokploy/server/setup/config-paths";
import {
	initializeCaddy,
	CADDY_IMAGE,
} from "@dokploy/server/setup/caddy-setup";
import { initializePostgres } from "@dokploy/server/setup/postgres-setup";
import { initializeRedis } from "@dokploy/server/setup/redis-setup";
import {
	initializeNetwork,
	initializeSwarm,
} from "@dokploy/server/setup/setup";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeStandaloneTraefik,
	TRAEFIK_VERSION,
} from "@dokploy/server/setup/traefik-setup";

// Respect INGRESS_PROVIDER env variable so users can choose Caddy at install
// time.  Defaults to "traefik" for backwards-compatibility.
const INGRESS_PROVIDER = process.env.INGRESS_PROVIDER ?? "traefik";

(async () => {
	try {
		setupDirectories();
		await initializeSwarm();
		await initializeNetwork();

		if (INGRESS_PROVIDER === "caddy") {
			console.log("Ingress provider: Caddy (HA)");
			await execAsync(`docker pull ${CADDY_IMAGE}`);
			const redisUrl =
				process.env.REDIS_URL ||
				`redis://dokploy-redis:${process.env.REDIS_PORT || 6379}`;
			await initializeCaddy({ redisUrl });
		} else {
			console.log("Ingress provider: Traefik");
			createDefaultMiddlewares();
			createDefaultTraefikConfig();
			createDefaultServerTraefikConfig();
			await execAsync(`docker pull traefik:v${TRAEFIK_VERSION}`);
			await initializeStandaloneTraefik();
		}

		await initializeRedis();
		await initializePostgres();
		console.log("Dokploy setup completed");
		exit(0);
	} catch (e) {
		console.error("Error in dokploy setup", e);
	}
})();
