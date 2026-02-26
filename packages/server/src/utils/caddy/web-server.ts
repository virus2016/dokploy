import type { webServerSettings } from "@dokploy/server/db/schema/web-server-settings";
import {
	getCaddyControllerLabels,
	updateCaddyControllerLabels,
} from "./application";

/**
 * Update the Dokploy web server's own domain routing in Caddy.
 *
 * Parallel to `updateServerTraefik` in the Traefik layer: configures
 * Caddy to route the admin UI domain to the Dokploy container.
 */
export const updateServerCaddy = async (
	settings: typeof webServerSettings.$inferSelect | null,
	newHost: string | null,
): Promise<void> => {
	const { https, certificateType } = settings || {};

	const labels = await getCaddyControllerLabels();

	// Remove previous dokploy web-server labels
	const cleaned: Record<string, string> = {};
	for (const [key, value] of Object.entries(labels)) {
		if (!key.startsWith("caddy_dokploy_app")) {
			cleaned[key] = value;
		}
	}

	if (!newHost) {
		await updateCaddyControllerLabels(cleaned);
		return;
	}

	const prefix = "caddy_dokploy_app";
	const upstream = `dokploy:${process.env.PORT || 3000}`;

	const siteAddress = https ? newHost : `http://${newHost}`;
	cleaned[prefix] = siteAddress;
	cleaned[`${prefix}.reverse_proxy`] = upstream;

	// TLS configuration
	if (https && certificateType === "letsencrypt") {
		// Caddy handles Let's Encrypt automatically for bare hostnames
	}

	await updateCaddyControllerLabels(cleaned);
};

/**
 * Update the Let's Encrypt email in Caddy's global options.
 *
 * caddy-docker-proxy supports global options via labels without a site
 * address. We set `caddy.email` on the controller service.
 */
export const updateCaddyLetsEncryptEmail = async (
	newEmail: string | null,
): Promise<void> => {
	if (!newEmail) return;

	const labels = await getCaddyControllerLabels();
	labels["caddy.email"] = newEmail;
	await updateCaddyControllerLabels(labels);
};
