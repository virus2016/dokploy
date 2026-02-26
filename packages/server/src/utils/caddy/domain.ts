import type { Domain } from "@dokploy/server/services/domain";
import type { ApplicationNested } from "../builders";
import {
	getCaddyControllerLabels,
	updateCaddyControllerLabels,
} from "./application";
import {
	buildCaddyLabelsForDomain,
	caddyLabelPrefix,
	removeCaddyLabelsForDomain,
} from "./labels";

/**
 * Manage a domain's Caddy routing config.
 *
 * For non-compose applications the routing labels are stored on the
 * Caddy controller Docker service (caddy-docker-proxy reads them and
 * generates the corresponding Caddyfile entries). Explicit upstream
 * addresses (appName:port) are used so the controller service itself
 * doesn't need to run the application.
 */
export const manageCaddyDomain = async (
	app: ApplicationNested,
	domain: Domain,
) => {
	const { appName, serverId } = app;
	const labels = await getCaddyControllerLabels(serverId);

	// Remove any existing labels for this domain before adding new ones
	const cleanedLabels = removeCaddyLabelsForDomain(
		labels,
		domain.uniqueConfigKey,
	);

	const newLabels = buildCaddyLabelsForDomain(appName, domain, app);

	const merged = { ...cleanedLabels, ...newLabels };
	await updateCaddyControllerLabels(merged, serverId);
};

/**
 * Remove a domain's Caddy routing labels from the controller service.
 */
export const removeCaddyDomain = async (
	application: ApplicationNested,
	uniqueKey: number,
) => {
	const { serverId } = application;
	const labels = await getCaddyControllerLabels(serverId);
	const cleaned = removeCaddyLabelsForDomain(labels, uniqueKey);
	await updateCaddyControllerLabels(cleaned, serverId);
};
