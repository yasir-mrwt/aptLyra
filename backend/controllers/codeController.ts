import { Response } from "express";
import asyncHandler from "express-async-handler";
import { AppError } from "../types/errors.js";
import logger from "../utils/logger.js";
import { AuthenticatedRequest } from "../types/express.js";

// JDoodle API language mapping
// Maps our standard language strings to JDoodle's language identifiers
const languageMap: Record<string, string> = {
  javascript: "nodejs",
  python: "python3",
  java: "java",
  cpp: "cpp17",
  c: "c",
  csharp: "csharp",
  go: "go",
  rust: "rust",
  php: "php",
  ruby: "ruby",
  swift: "swift",
  kotlin: "kotlin",
  scala: "scala",
  perl: "perl",
  lua: "lua",
  dart: "dart",
  bash: "bash",
  shell: "bash",
  r: "r",
  elixir: "elixir",
  haskell: "haskell",
  clojure: "clojure",
  fsharp: "fsharp"
};

/**
 * @desc    Execute code via JDoodle API
 * @route   POST /api/code/execute
 * @access  Private
 */
export const executeCode = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { language, code, stdin } = req.body;

  if (!language || !code) {
    throw new AppError("VALIDATION_ERROR", "Language and code are required", undefined, 400);
  }

  const jdoodleLanguage = languageMap[language.toLowerCase()];

  // If the language isn't natively supported, fallback to trying the exact string
  const executeLanguage = jdoodleLanguage || language.toLowerCase();

  try {
    const jdoodleResponse = await fetch("https://api.jdoodle.com/v1/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: process.env.JDOODLE_CLIENT_ID,
        clientSecret: process.env.JDOODLE_CLIENT_SECRET,
        script: code,
        stdin: stdin || "",
        language: executeLanguage,
        versionIndex: "0",
      }),
    });

    const data: any = await jdoodleResponse.json();

    if (!jdoodleResponse.ok) {
      logger.error("JDoodle API error:", data);
      throw new AppError("INTERNAL_ERROR", data.error || "Execution failed", undefined, 500);
    }

    // JDoodle returns { output, statusCode, memory, cpuTime, error }
    // We map this to the format expected by the frontend's codeRunnerService.ts
    // which was originally expecting a Piston-like { run: { stdout, stderr, code, etc } } format.

    // Note: JDoodle doesn't separate stdout and stderr clearly, they are both in `output`.
    const isError = data.statusCode !== 200 && data.statusCode !== null;

    res.json({
      run: {
        stdout: isError ? "" : data.output,
        stderr: isError ? data.output : "",
        code: data.statusCode === 200 ? 0 : 1, // 0 for success
        signal: null,
        cpuTime: data.cpuTime,
        memory: data.memory,
      },
    });
  } catch (error: any) {
    logger.error("Code execution failed:", error);
    throw new AppError("INTERNAL_ERROR", "Failed to execute code", error.message, 500);
  }
});
