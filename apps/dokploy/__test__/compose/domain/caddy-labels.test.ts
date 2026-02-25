import type { Domain } from "@dokploy/server";
import {
	createCaddyDomainLabels,
	removeCaddyLabelsForDomain,
} from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("createCaddyDomainLabels", () => {
	const appName = "test-app";
	const baseDomain: Domain = {
		host: "example.com",
		port: 8080,
		https: false,
		uniqueConfigKey: 1,
		customCertResolver: null,
		certificateType: "none",
		applicationId: "",
		composeId: "",
		domainType: "compose",
		serviceName: "test-app",
		domainId: "",
		path: "/",
		createdAt: "",
		previewDeploymentId: "",
		internalPath: "/",
		stripPath: false,
	};

	it("should create basic labels for a simple domain (HTTP)", () => {
		const labels = createCaddyDomainLabels(appName, baseDomain);
		expect(labels).toContain("caddy_1=http://example.com");
		expect(labels).toContain("caddy_1.reverse_proxy={{upstreams 8080}}");
	});

	it("should create labels with HTTPS site address", () => {
		const httpsDomain = {
			...baseDomain,
			https: true,
			certificateType: "letsencrypt" as const,
		};
		const labels = createCaddyDomainLabels(appName, httpsDomain);
		// Caddy auto-enables HTTPS for bare hostnames
		expect(labels).toContain("caddy_1=example.com");
		expect(labels).toContain("caddy_1.reverse_proxy={{upstreams 8080}}");
	});

	it("should handle different ports correctly", () => {
		const customPortDomain = { ...baseDomain, port: 3000 };
		const labels = createCaddyDomainLabels(appName, customPortDomain);
		expect(labels).toContain("caddy_1.reverse_proxy={{upstreams 3000}}");
	});

	it("should add path matching and handle block for path routing", () => {
		const pathDomain = { ...baseDomain, path: "/api" };
		const labels = createCaddyDomainLabels(appName, pathDomain);

		expect(labels).toContain("caddy_1=http://example.com");
		expect(labels).toContain("caddy_1.@match_1.path=/api /api/*");
		expect(labels).toContain("caddy_1.handle=@match_1");
		expect(labels).toContain(
			"caddy_1.handle.0_reverse_proxy={{upstreams 8080}}",
		);
	});

	it("should add uri strip_prefix when stripPath is enabled", () => {
		const stripPathDomain = {
			...baseDomain,
			path: "/api",
			stripPath: true,
		};
		const labels = createCaddyDomainLabels(appName, stripPathDomain);

		expect(labels).toContain("caddy_1.handle.0_uri=strip_prefix /api");
		expect(labels).toContain(
			"caddy_1.handle.1_reverse_proxy={{upstreams 8080}}",
		);
	});

	it("should add rewrite when internalPath is set", () => {
		const internalPathDomain = {
			...baseDomain,
			path: "/api",
			internalPath: "/v1",
		};
		const labels = createCaddyDomainLabels(appName, internalPathDomain);

		expect(labels).toContain("caddy_1.handle.0_rewrite=/v1{uri}");
		expect(labels).toContain(
			"caddy_1.handle.1_reverse_proxy={{upstreams 8080}}",
		);
	});

	it("should combine stripPath and internalPath in correct order", () => {
		const combinedDomain = {
			...baseDomain,
			path: "/api",
			stripPath: true,
			internalPath: "/v1",
		};
		const labels = createCaddyDomainLabels(appName, combinedDomain);

		expect(labels).toContain("caddy_1.handle.0_uri=strip_prefix /api");
		expect(labels).toContain("caddy_1.handle.1_rewrite=/v1{uri}");
		expect(labels).toContain(
			"caddy_1.handle.2_reverse_proxy={{upstreams 8080}}",
		);
	});

	it("should use different uniqueConfigKey for label prefix", () => {
		const domain = { ...baseDomain, uniqueConfigKey: 42 };
		const labels = createCaddyDomainLabels(appName, domain);
		expect(labels.some((l) => l.startsWith("caddy_42="))).toBe(true);
		expect(labels.some((l) => l.startsWith("caddy_42."))).toBe(true);
	});

	it("should force HTTP for HTTPS with certificate type none", () => {
		const domain = {
			...baseDomain,
			https: true,
			certificateType: "none" as const,
		};
		const labels = createCaddyDomainLabels(appName, domain);
		expect(labels).toContain("caddy_1=http://example.com");
	});

	it("should treat path '/' with stripPath as simple route (no path handling)", () => {
		const domain = {
			...baseDomain,
			path: "/",
			stripPath: true,
		};
		const labels = createCaddyDomainLabels(appName, domain);
		// path "/" is treated as no path, so stripPath should be ignored
		expect(labels).toContain("caddy_1=http://example.com");
		expect(labels).toContain("caddy_1.reverse_proxy={{upstreams 8080}}");
		// Should NOT have any handle/matcher labels
		expect(labels.some((l) => l.includes("handle"))).toBe(false);
		expect(labels.some((l) => l.includes("@match"))).toBe(false);
		expect(labels.some((l) => l.includes("strip_prefix"))).toBe(false);
	});
});

describe("removeCaddyLabelsForDomain", () => {
	it("should remove all labels for a specific uniqueConfigKey", () => {
		const labels: Record<string, string> = {
			caddy_1: "example.com",
			"caddy_1.reverse_proxy": "{{upstreams 8080}}",
			caddy_2: "other.com",
			"caddy_2.reverse_proxy": "{{upstreams 3000}}",
			"some.other.label": "value",
		};

		const result = removeCaddyLabelsForDomain(labels, 1);

		expect(result).not.toHaveProperty("caddy_1");
		expect(result).not.toHaveProperty("caddy_1.reverse_proxy");
		expect(result).toHaveProperty("caddy_2", "other.com");
		expect(result).toHaveProperty("caddy_2.reverse_proxy", "{{upstreams 3000}}");
		expect(result).toHaveProperty("some.other.label", "value");
	});

	it("should return all labels if no matching key found", () => {
		const labels: Record<string, string> = {
			caddy_1: "example.com",
			"caddy_1.reverse_proxy": "{{upstreams 8080}}",
		};

		const result = removeCaddyLabelsForDomain(labels, 99);
		expect(Object.keys(result)).toHaveLength(2);
	});
});
