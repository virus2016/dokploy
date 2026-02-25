import type { CreateServiceOptions } from "dockerode";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export const CADDY_HTTP_PORT =
	Number.parseInt(process.env.CADDY_HTTP_PORT!, 10) || 80;
export const CADDY_HTTPS_PORT =
	Number.parseInt(process.env.CADDY_HTTPS_PORT!, 10) || 443;

/**
 * Image used for both the controller and server roles.
 * lucaslorentz/caddy-docker-proxy supports a split controller/server model
 * suitable for Docker Swarm HA deployments.
 */
export const CADDY_IMAGE = "lucaslorentz/caddy-docker-proxy:ci-alpine";

export interface CaddyOptions {
	serverId?: string;
	redisUrl?: string;
}

/**
 * Build the environment variables for caddy-docker-proxy that configure
 * Redis-backed TLS storage when a Redis URL is available.
 */
const buildCaddyEnv = (redisUrl?: string): string[] => {
	const env = ["CADDY_INGRESS_NETWORKS=dokploy-network"];

	if (redisUrl) {
		// Pass Redis connection details so the controller can inject the
		// storage block into the global Caddyfile options.
		env.push(`CADDY_STORAGE_REDIS_URL=${redisUrl}`);
	}

	return env;
};

/**
 * Deploy the Caddy controller service on Swarm manager nodes.
 * The controller watches the Docker API and distributes config to
 * server instances via a shared Redis event stream.
 */
export const initializeCaddyController = async ({
	serverId,
	redisUrl,
}: CaddyOptions = {}) => {
	const appName = "dokploy-caddy-controller";
	const docker = await getRemoteDocker(serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				Image: CADDY_IMAGE,
				Env: buildCaddyEnv(redisUrl),
				Mounts: [
					{
						Type: "bind",
						Source: "/var/run/docker.sock",
						Target: "/var/run/docker.sock",
						ReadOnly: true,
					},
				],
			},
			Networks: [{ Target: "dokploy-network" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
	};

	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: inspect.Spec.TaskTemplate.ForceUpdate + 1,
			},
		});
		console.log("Caddy Controller Updated ✅");
	} catch {
		await docker.createService(settings);
		console.log("Caddy Controller Started ✅");
	}
};

/**
 * Deploy Caddy server instances as a global service on Swarm worker nodes.
 * Each server instance receives configuration from the controller and
 * serves HTTP/HTTPS traffic. TLS certificates are shared via Redis.
 */
export const initializeCaddyServer = async ({
	serverId,
	redisUrl,
}: CaddyOptions = {}) => {
	const appName = "dokploy-caddy-server";
	const docker = await getRemoteDocker(serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				Image: CADDY_IMAGE,
				Env: buildCaddyEnv(redisUrl),
				Mounts: [],
			},
			Networks: [{ Target: "dokploy-network" }],
			Placement: {
				Constraints: ["node.role==worker"],
			},
		},
		Mode: {
			Global: {},
		},
		EndpointSpec: {
			Ports: [
				{
					TargetPort: CADDY_HTTP_PORT,
					PublishedPort: CADDY_HTTP_PORT,
					PublishMode: "host",
					Protocol: "tcp",
				},
				{
					TargetPort: CADDY_HTTPS_PORT,
					PublishedPort: CADDY_HTTPS_PORT,
					PublishMode: "host",
					Protocol: "tcp",
				},
			],
		},
	};

	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: inspect.Spec.TaskTemplate.ForceUpdate + 1,
			},
		});
		console.log("Caddy Server Updated ✅");
	} catch {
		await docker.createService(settings);
		console.log("Caddy Server Started ✅");
	}
};

/**
 * Initialize Caddy in HA mode for Swarm: deploys the controller on managers
 * and server instances globally on workers, backed by Redis for shared TLS storage.
 */
export const initializeCaddy = async (options: CaddyOptions = {}) => {
	await initializeCaddyController(options);
	await initializeCaddyServer(options);
};

/**
 * Remove Caddy services from the Swarm.
 */
export const removeCaddyServices = async (serverId?: string) => {
	const docker = await getRemoteDocker(serverId);
	for (const name of [
		"dokploy-caddy-controller",
		"dokploy-caddy-server",
	] as const) {
		try {
			await docker.getService(name).remove();
			console.log(`${name} removed ✅`);
		} catch {
			// Service may not exist; ignore
		}
	}
};
