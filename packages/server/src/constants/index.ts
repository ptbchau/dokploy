import path, { extname, normalize, resolve } from "node:path";
import Docker from "dockerode";

export const IS_CLOUD = process.env.IS_CLOUD === "true";
export const docker = new Docker();

export const paths = (isServer = false) => {
	const BASE_PATH =
		isServer || process.env.NODE_ENV === "production"
			? "/etc/dokploy"
			: path.join(process.cwd(), ".docker");
	const MAIN_TRAEFIK_PATH = `${BASE_PATH}/traefik`;
	const DYNAMIC_TRAEFIK_PATH = `${MAIN_TRAEFIK_PATH}/dynamic`;

	return {
		BASE_PATH,
		MAIN_TRAEFIK_PATH,
		DYNAMIC_TRAEFIK_PATH,
		LOGS_PATH: `${BASE_PATH}/logs`,
		APPLICATIONS_PATH: `${BASE_PATH}/applications`,
		COMPOSE_PATH: `${BASE_PATH}/compose`,
		SSH_PATH: `${BASE_PATH}/ssh`,
		CERTIFICATES_PATH: `${DYNAMIC_TRAEFIK_PATH}/certificates`,
		MONITORING_PATH: `${BASE_PATH}/monitoring`,
		REGISTRY_PATH: `${BASE_PATH}/registry`,
		SCHEDULES_PATH: `${BASE_PATH}/schedules`,
		UPLOADS_PATH: `${BASE_PATH}/uploads`,
		AVATARS_PATH: `${BASE_PATH}/uploads/avatars`,
	};
};

export const getAvatarFileExtension = (filename: string): string => {
	return extname(filename).toLowerCase();
}

export const getAvatarContentType = (filename: string): string => {
	const extension = getAvatarFileExtension(filename);
	const extensionToMimeType: Record<string, string> = {
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".png": "image/png",
		".gif": "image/gif",
		".webp": "image/webp",
	};
	return extensionToMimeType[extension] || "application/octet-stream";
}

export const isValidAvatarFilename = (filename: string): boolean => {
	const MAX_FILENAME_LENGTH = 255;
	if (!filename || filename.length > MAX_FILENAME_LENGTH) {
		return false;
	}
	const filenamePattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;
	return filenamePattern.test(filename);
}

export const validatePathWithinBase = (
	basePath: string,
	filename: string
): string | null => {
	try {
		const normalizedBase = normalize(resolve(basePath));
		const requestedPath = resolve(basePath, filename);
		const normalizedRequestedPath = normalize(requestedPath);
		if (!normalizedRequestedPath.startsWith(normalizedBase + path.sep) &&
			normalizedRequestedPath !== normalizedBase) {
			return null;
		}
		return normalizedRequestedPath;
	} catch (error) {
		return null;
	}
}