import type { Redirect } from "@dokploy/server/services/redirect";
import type { ApplicationNested } from "../builders";
import {
	getCaddyControllerLabels,
	updateCaddyControllerLabels,
} from "./application";

/**
 * Label prefix for a redirect entry on the Caddy controller service.
 *
 * Caddy doesn't have a separate middleware concept for redirects like
 * Traefik. Instead we inject `redir` directives into every site block
 * that belongs to the application. Since we manage domain labels on the
 * controller, we store the redirect as a standalone snippet and rely on
 * the domain labels to import / co-exist with them.
 *
 * Practically, we update ALL domain site-blocks for the application to
 * include the `redir` directive.
 */

const redirectLabelKey = (
	appName: string,
	uniqueConfigKey: number,
	domainKey: number,
) => `caddy_${domainKey}.redir_${uniqueConfigKey}`;

/**
 * Add redirect labels to the Caddy controller for every domain belonging
 * to the application.
 */
export const createCaddyRedirectMiddleware = async (
	application: ApplicationNested,
	data: Redirect,
): Promise<void> => {
	const { serverId } = application;
	const labels = await getCaddyControllerLabels(serverId);

	// Find all domain site-blocks for this application's domains
	for (const domain of application.domains ?? []) {
		const key = redirectLabelKey(
			application.appName,
			data.uniqueConfigKey,
			domain.uniqueConfigKey,
		);
		labels[key] = `${data.regex} ${data.replacement} ${data.permanent ? "301" : "302"}`;
	}

	await updateCaddyControllerLabels(labels, serverId);
};

/**
 * Update an existing redirect on the Caddy controller.
 */
export const updateCaddyRedirectMiddleware = async (
	application: ApplicationNested,
	data: Redirect,
): Promise<void> => {
	// Remove then re-add – labels are idempotent
	await removeCaddyRedirectMiddleware(application, data);
	await createCaddyRedirectMiddleware(application, data);
};

/**
 * Remove redirect labels from the Caddy controller.
 */
export const removeCaddyRedirectMiddleware = async (
	application: ApplicationNested,
	data: Redirect,
): Promise<void> => {
	const { serverId } = application;
	const labels = await getCaddyControllerLabels(serverId);

	for (const domain of application.domains ?? []) {
		const key = redirectLabelKey(
			application.appName,
			data.uniqueConfigKey,
			domain.uniqueConfigKey,
		);
		delete labels[key];
	}

	await updateCaddyControllerLabels(labels, serverId);
};
