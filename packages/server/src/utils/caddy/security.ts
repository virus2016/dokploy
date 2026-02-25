import type { Security } from "@dokploy/server/services/security";
import * as bcrypt from "bcrypt";
import type { ApplicationNested } from "../builders";
import {
	getCaddyControllerLabels,
	updateCaddyControllerLabels,
} from "./application";

/**
 * Caddy basic_auth label helpers.
 *
 * For each application that has security (basic auth), we add
 * `basicauth` directives to the domain's site block on the Caddy
 * controller service. caddy-docker-proxy converts these labels into:
 *
 *   basicauth /* {
 *       <username> <bcrypt-hash>
 *   }
 *
 * Since multiple users may exist for the same application, the labels
 * are keyed by the security entry's uniqueConfigKey.
 */

const securityLabelKeyPrefix = (domainKey: number) =>
	`caddy_${domainKey}.basicauth`;

/**
 * Add a basic-auth user to every domain belonging to the application.
 */
export const createCaddySecurityMiddleware = async (
	application: ApplicationNested,
	data: Security,
): Promise<void> => {
	const { serverId } = application;
	const labels = await getCaddyControllerLabels(serverId);

	const hash = await bcrypt.hash(data.password, 10);

	for (const domain of application.domains ?? []) {
		const prefix = securityLabelKeyPrefix(domain.uniqueConfigKey);
		// Caddy basicauth directive: `basicauth /* { <user> <hash> }`
		labels[prefix] = "/* bcrypt";
		labels[`${prefix}.${data.username}`] = hash;
	}

	await updateCaddyControllerLabels(labels, serverId);
};

/**
 * Remove a basic-auth user from the Caddy controller labels.
 */
export const removeCaddySecurityMiddleware = async (
	application: ApplicationNested,
	data: Security,
): Promise<void> => {
	const { serverId } = application;
	const labels = await getCaddyControllerLabels(serverId);

	for (const domain of application.domains ?? []) {
		const prefix = securityLabelKeyPrefix(domain.uniqueConfigKey);
		delete labels[`${prefix}.${data.username}`];

		// If no users remain, remove the basicauth directive itself
		const hasRemainingUsers = Object.keys(labels).some(
			(k) => k.startsWith(`${prefix}.`) && k !== prefix,
		);
		if (!hasRemainingUsers) {
			delete labels[prefix];
		}
	}

	await updateCaddyControllerLabels(labels, serverId);
};
