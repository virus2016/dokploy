import type { Domain } from "@dokploy/server/services/domain";
import type { ApplicationNested } from "../builders";

/**
 * Caddy-docker-proxy label prefix.
 * Each isolated site block uses `caddy_<id>` where <id> is derived from
 * the domain's uniqueConfigKey to ensure global uniqueness.
 */
export const caddyLabelPrefix = (uniqueConfigKey: number) =>
	`caddy_${uniqueConfigKey}`;

/**
 * Convert an internationalized domain name (IDN) to ASCII punycode format.
 */
const toPunycode = (host: string): string => {
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return host;
	}
};

/**
 * Build the set of Caddy-docker-proxy labels for a single domain on a
 * non-compose application. The labels use explicit upstream addresses
 * (appName:port) because they are placed on the Caddy controller
 * service, not on the application container itself.
 */
export const buildCaddyLabelsForDomain = (
	appName: string,
	domain: Domain,
	app?: ApplicationNested,
): Record<string, string> => {
	const {
		host,
		port,
		https,
		uniqueConfigKey,
		certificateType,
		path,
		stripPath,
		internalPath,
	} = domain;

	const prefix = caddyLabelPrefix(uniqueConfigKey);
	const punycodeHost = toPunycode(host);
	const upstream = `${appName}:${port || 80}`;
	const labels: Record<string, string> = {};

	// Determine site address
	// Caddy auto-enables HTTPS for bare hostnames. Prefix with http://
	// when the user explicitly disables HTTPS.
	const siteAddress = https ? punycodeHost : `http://${punycodeHost}`;

	const hasPath = path && path !== "/";
	const needsStrip = stripPath && hasPath;
	const needsInternalPath =
		internalPath && internalPath !== "/" && internalPath.startsWith("/");

	if (!hasPath && !needsStrip && !needsInternalPath) {
		// Simple case: no path manipulation
		labels[prefix] = siteAddress;
		labels[`${prefix}.reverse_proxy`] = upstream;
	} else {
		// Path-based routing – use a handle block with a named matcher
		labels[prefix] = siteAddress;

		const matcherName = `@match_${uniqueConfigKey}`;
		labels[`${prefix}.${matcherName}.path`] = `${path} ${path}/*`;

		let order = 0;

		if (needsStrip) {
			labels[`${prefix}.handle.${order}_uri`] = `strip_prefix ${path}`;
			order++;
		}

		if (needsInternalPath) {
			labels[`${prefix}.handle.${order}_rewrite`] = `${internalPath}{uri}`;
			order++;
		}

		labels[`${prefix}.handle.${order}_reverse_proxy`] = upstream;
		labels[`${prefix}.handle`] = matcherName;
	}

	// TLS / certificate configuration
	if (https) {
		if (certificateType === "letsencrypt") {
			// Caddy uses ACME by default; explicit email can be set via
			// global options. Nothing extra needed per-site.
		} else if (certificateType === "none") {
			// Force plain HTTP – override site address
			labels[prefix] = `http://${punycodeHost}`;
		}
	}

	return labels;
};

/**
 * Build Caddy-docker-proxy labels for compose deployments.
 *
 * Unlike the controller-label approach used for non-compose apps, compose
 * labels use `{{upstreams <port>}}` so caddy-docker-proxy resolves to the
 * actual container/service IPs.
 */
export const createCaddyDomainLabels = (
	appName: string,
	domain: Domain,
): string[] => {
	const {
		host,
		port,
		https,
		uniqueConfigKey,
		certificateType,
		path,
		stripPath,
		internalPath,
	} = domain;

	const prefix = caddyLabelPrefix(uniqueConfigKey);
	const punycodeHost = toPunycode(host);
	const upstream = `{{upstreams ${port || 80}}}`;
	const labels: string[] = [];

	const siteAddress = https ? punycodeHost : `http://${punycodeHost}`;

	const hasPath = path && path !== "/";
	const needsStrip = stripPath && hasPath;
	const needsInternalPath =
		internalPath && internalPath !== "/" && internalPath.startsWith("/");

	if (!hasPath && !needsStrip && !needsInternalPath) {
		labels.push(`${prefix}=${siteAddress}`);
		labels.push(`${prefix}.reverse_proxy=${upstream}`);
	} else {
		labels.push(`${prefix}=${siteAddress}`);

		const matcherName = `@match_${uniqueConfigKey}`;
		labels.push(`${prefix}.${matcherName}.path=${path} ${path}/*`);

		let order = 0;

		if (needsStrip) {
			labels.push(
				`${prefix}.handle.${order}_uri=strip_prefix ${path}`,
			);
			order++;
		}

		if (needsInternalPath) {
			labels.push(
				`${prefix}.handle.${order}_rewrite=${internalPath}{uri}`,
			);
			order++;
		}

		labels.push(`${prefix}.handle.${order}_reverse_proxy=${upstream}`);
		labels.push(`${prefix}.handle=${matcherName}`);
	}

	if (https && certificateType === "none") {
		// Override to force HTTP only
		labels[0] = `${prefix}=http://${punycodeHost}`;
	}

	return labels;
};

/**
 * Remove all Caddy labels that belong to a specific domain (identified by
 * uniqueConfigKey) from a labels map.
 */
export const removeCaddyLabelsForDomain = (
	labels: Record<string, string>,
	uniqueConfigKey: number,
): Record<string, string> => {
	const prefix = `${caddyLabelPrefix(uniqueConfigKey)}`;
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(labels)) {
		// Match exact prefix or prefix followed by a dot
		if (key !== prefix && !key.startsWith(`${prefix}.`)) {
			result[key] = value;
		}
	}
	return result;
};
