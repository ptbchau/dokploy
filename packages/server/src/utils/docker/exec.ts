import { execAsync, execAsyncRemote } from "../process/execAsync";

export type ResolveWorkingDirParams = {
	containerId: string;
	serverId?: string | null;
	composeWorkingDir?: string | null | undefined;
};

/**
 * Resolve a safe working directory to be used with `docker exec -w`.
 * Priority:
 * 1) Compose `working_dir` if provided
 * 2) Container's `Config.WorkingDir` via `docker inspect`
 * 3) Fallback to "/"
 */
export const resolveWorkingDirectory = async (
	params: ResolveWorkingDirParams,
): Promise<string> => {
	const { containerId, serverId, composeWorkingDir } = params;

	// 1) Prefer Compose working_dir when available
	if (composeWorkingDir && composeWorkingDir.trim().length > 0) {
		return composeWorkingDir.trim();
	}

	// 2) Try to read from container runtime config
	try {
		const inspectCmd = `docker inspect --format '{{.Config.WorkingDir}}' ${containerId}`;
		const { stdout } = serverId
			? await execAsyncRemote(serverId, inspectCmd)
			: await execAsync(inspectCmd);
		const candidate = (stdout || "").toString().trim();
		if (candidate) {
			return candidate;
		}
	} catch (_error) {
		// ignore and fallback
	}

	// 3) Final fallback to root to avoid blocking the user
	return "/";
};


