import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "@/utils/api";

export const SelectIngressProvider = () => {
	const { data: webServerSettings, refetch } =
		api.settings.getWebServerSettings.useQuery();

	const { mutateAsync: updateIngressProvider, isLoading } =
		api.settings.updateIngressProvider.useMutation();

	const currentProvider = webServerSettings?.ingressProvider ?? "traefik";

	const handleChange = async (value: "traefik" | "caddy") => {
		try {
			await updateIngressProvider({ ingressProvider: value });
			await refetch();
			toast.success(
				`Ingress provider switched to ${value === "traefik" ? "Traefik" : "Caddy (HA)"}`,
			);
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to update ingress provider";
			toast.error(message);
		}
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Ingress Provider</CardTitle>
				<CardDescription>
					Choose the reverse proxy used to route traffic to your applications.
					Caddy (HA) uses Redis-backed certificate storage so any Swarm node can
					serve any domain.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<AlertBlock type="warning">
					Switching ingress providers will start/stop Docker services and may
					cause brief downtime.
				</AlertBlock>

				<RadioGroup
					value={currentProvider}
					className="grid sm:grid-cols-2 gap-4"
					onValueChange={(v) => {
						// Handled via the DialogAction confirmation below
					}}
				>
					<DialogAction
						title="Switch to Traefik"
						description={
							<p>
								This will stop any Caddy services and start Traefik as the
								ingress provider. Brief downtime may occur.
							</p>
						}
						onClick={() => handleChange("traefik")}
						disabled={currentProvider === "traefik" || isLoading}
						type="default"
					>
						<div
							className={`flex items-start space-x-3 rounded-lg border p-4 cursor-pointer ${
								currentProvider === "traefik"
									? "border-primary bg-primary/5"
									: "border-border hover:border-muted-foreground/50"
							}`}
						>
							<RadioGroupItem
								value="traefik"
								id="traefik"
								className="mt-0.5"
								checked={currentProvider === "traefik"}
								onClick={(e) => e.preventDefault()}
							/>
							<div className="space-y-1">
								<Label htmlFor="traefik" className="cursor-pointer font-medium">
									Traefik{" "}
									<span className="text-xs text-muted-foreground">(default)</span>
								</Label>
								<p className="text-xs text-muted-foreground">
									Standard reverse proxy. Stores TLS certificates on the local
									filesystem.
								</p>
							</div>
						</div>
					</DialogAction>

					<DialogAction
						title="Switch to Caddy (HA)"
						description={
							<div className="space-y-2">
								<p>
									This will deploy{" "}
									<strong>caddy-docker-proxy</strong> in Controller + Server
									mode on your Swarm.
								</p>
								<ul className="list-disc list-inside text-sm space-y-1">
									<li>Controller runs on manager nodes</li>
									<li>
										Server instances run globally on worker nodes (HA traffic)
									</li>
									<li>
										TLS certificates are stored in Redis so every node can
										serve any domain
									</li>
								</ul>
								<p className="text-sm text-muted-foreground">
									Requires Docker Swarm mode and a running Redis instance
									(Dokploy&apos;s built-in Redis is used automatically).
								</p>
							</div>
						}
						onClick={() => handleChange("caddy")}
						disabled={currentProvider === "caddy" || isLoading}
						type="default"
					>
						<div
							className={`flex items-start space-x-3 rounded-lg border p-4 cursor-pointer ${
								currentProvider === "caddy"
									? "border-primary bg-primary/5"
									: "border-border hover:border-muted-foreground/50"
							}`}
						>
							<RadioGroupItem
								value="caddy"
								id="caddy"
								className="mt-0.5"
								checked={currentProvider === "caddy"}
								onClick={(e) => e.preventDefault()}
							/>
							<div className="space-y-1">
								<Label htmlFor="caddy" className="cursor-pointer font-medium">
									Caddy{" "}
									<span className="text-xs text-muted-foreground">(HA)</span>
								</Label>
								<p className="text-xs text-muted-foreground">
									Highly-available Caddy proxy with Redis-backed TLS storage.
									Best for multi-node Swarm deployments.
								</p>
							</div>
						</div>
					</DialogAction>
				</RadioGroup>

				{currentProvider === "caddy" && (
					<AlertBlock type="info">
						Caddy (HA) is active. TLS certificates are shared via Redis. Caddy
						server instances run globally on all worker nodes.
					</AlertBlock>
				)}
			</CardContent>
		</Card>
	);
};
