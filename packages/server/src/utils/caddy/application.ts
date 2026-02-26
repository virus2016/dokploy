import { getRemoteDocker } from "../servers/remote-docker";
import { caddyLabelPrefix, removeCaddyLabelsForDomain } from "./labels";

const CADDY_CONTROLLER_NAME = "dokploy-caddy-controller";

/**
 * Retrieve the current labels from the Caddy controller Docker service.
 */
export const getCaddyControllerLabels = async (
	serverId?: string | null,
): Promise<Record<string, string>> => {
	const docker = await getRemoteDocker(serverId ?? undefined);
	try {
		const service = docker.getService(CADDY_CONTROLLER_NAME);
		const info = await service.inspect();
		return info.Spec?.Labels ?? {};
	} catch {
		return {};
	}
};

/**
 * Update the labels on the Caddy controller Docker service.
 *
 * caddy-docker-proxy watches Docker events: when the service spec
 * changes it regenerates the Caddyfile and triggers a graceful reload.
 */
export const updateCaddyControllerLabels = async (
	labels: Record<string, string>,
	serverId?: string | null,
): Promise<void> => {
	const docker = await getRemoteDocker(serverId ?? undefined);
	const service = docker.getService(CADDY_CONTROLLER_NAME);
	const info = await service.inspect();

	await service.update({
		version: Number.parseInt(info.Version.Index),
		...info.Spec,
		Labels: labels,
		// Bump ForceUpdate so caddy-docker-proxy picks up the change
		TaskTemplate: {
			...info.Spec.TaskTemplate,
			ForceUpdate: (info.Spec.TaskTemplate?.ForceUpdate ?? 0) + 1,
		},
	});
};

/**
 * Remove all Caddy routing labels from the controller service.
 * Keeps only non-caddy labels (e.g. Docker internal labels).
 */
export const removeAllCaddyLabels = async (
	serverId?: string | null,
): Promise<void> => {
	const labels = await getCaddyControllerLabels(serverId);
	const cleaned: Record<string, string> = {};
	for (const [key, value] of Object.entries(labels)) {
		if (!key.startsWith("caddy")) {
			cleaned[key] = value;
		}
	}
	await updateCaddyControllerLabels(cleaned, serverId);
};

/**
 * Remove Caddy labels for a specific set of domain uniqueConfigKeys.
 *
 * Unlike `removeAllCaddyLabels` which strips every caddy label, this
 * only removes labels belonging to the given domains – keeping routing
 * intact for other applications.
 *
 * The caller must supply the domain keys *before* deleting the
 * application from the database (domain rows are cascade-deleted).
 */
export const removeCaddyLabelsForApp = async (
	domainKeys: number[],
	serverId?: string | null,
): Promise<void> => {
	if (domainKeys.length === 0) return;

	let labels = await getCaddyControllerLabels(serverId);
	for (const key of domainKeys) {
		labels = removeCaddyLabelsForDomain(labels, key);
	}
	await updateCaddyControllerLabels(labels, serverId);
};
