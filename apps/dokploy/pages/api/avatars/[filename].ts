import { NextApiRequest, NextApiResponse } from "next";
import { readFile } from "node:fs/promises";
import {
  paths,
  getAvatarFileExtension,
  getAvatarContentType,
  isValidAvatarFilename,
  validatePathWithinBase,
} from "@dokploy/server/constants";
import { ALLOWED_AVATAR_EXTENSIONS } from "@dokploy/server/constants/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  const { filename } = req.query;

  if (!filename || typeof filename !== "string") {
    return res.status(400).json({ message: "Filename is required" });
  }
  // Pattern validation - ensure filename matches system-generated pattern
  // And Length validation - ensure filename is not too long
  if (!isValidAvatarFilename(filename)) {
    return res.status(400).json({ message: "Invalid filename" });
  }

  // File extension validation to prevent file injection attacks
  const fileExtension = getAvatarFileExtension(filename);
  if (!fileExtension ||
    fileExtension === filename ||
    !ALLOWED_AVATAR_EXTENSIONS.includes(
      fileExtension as (typeof ALLOWED_AVATAR_EXTENSIONS)[number])
    ) {
    return res.status(400).json({ message: "Invalid file extension" });
  }
  // Path validation to prevent directory traversal attacks
  const { AVATARS_PATH } = paths();
  const safePath = validatePathWithinBase(AVATARS_PATH, filename);
  if (!safePath) {
    return res.status(400).json({ message: "Invalid file path." });
  }

  try {
    // Read file using the validated safepath
    const fileBuffer = await readFile(safePath);
    const contentType = getAvatarContentType(filename);
    // Tell the browser what type of file it is so it can render it correctly
    // Prevent execution of malicious files by setting the Content-Type header
    res.setHeader("Content-Type", contentType);
    // Cache the file for a year to improve performance
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // Tell browser to display file
    // Prevent download and execution by setting Content-Disposition to inline (OWASP recommendation)
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    // Better connection handling, progress indication
    res.setHeader("Content-Length", fileBuffer.length.toString());
    return res.status(200).send(fileBuffer);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return res.status(404).json({ message: "File not found" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
}