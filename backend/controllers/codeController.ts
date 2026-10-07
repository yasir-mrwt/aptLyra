import { Response } from "express";
import asyncHandler from "express-async-handler";
import { AppError } from "../types/errors.js";
import logger from "../utils/logger.js";
import { AuthenticatedRequest } from "../types/express.js";
import {sessionRepository} from "../models/Session.js";
import {evaluationService} from "../evaluation/service.js";
import {query} from "../config/db.js";

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
  const { language, code, stdin, sessionId, questionIndex } = req.body;
  const userId=(req.user?.id || req.user?._id)?.toString();
  let capture=false;
  if(sessionId!==undefined){
    if(typeof sessionId!=="string" || !/^[0-9a-f-]{36}$/i.test(sessionId) || !Number.isInteger(questionIndex) || questionIndex<0)throw new AppError("VALIDATION_ERROR","Invalid session question",undefined,400);
    const session=userId?await sessionRepository.findByIdForUser(sessionId,userId):null;
    if(!session)throw new AppError("VALIDATION_ERROR","Session not found",undefined,404);
    const q=session.questions[questionIndex];
    if(session.status!=="in-progress" || !q || q.questionType!=="coding" || q.isSubmitted || (session.planId && q.language!==language))throw new AppError("VALIDATION_ERROR","Question is not available for execution",undefined,409);
    if(q.questionVersionId && !(await query("SELECT entity_id FROM retrieval_entities WHERE purpose='question-selection' AND entity_id=$1",[q.questionVersionId])).rows.length)throw new AppError("VALIDATION_ERROR","Planned question unavailable",undefined,409);
    capture=session.scoringVersion==="rubric-v1";
  }

  if (typeof language!=="string" || typeof code!=="string" || !language || !code || code.length>50000 || (stdin!==undefined && (typeof stdin!=="string" || stdin.length>10000))) {
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
      signal: AbortSignal.timeout(30000),
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
      logger.error("JDoodle request unavailable");
      throw new AppError("INTERNAL_ERROR", "Execution failed", undefined, 500);
    }

    // JDoodle returns { output, statusCode, memory, cpuTime, error }
    // We map this to the format expected by the frontend's codeRunnerService.ts
    // which was originally expecting a Piston-like { run: { stdout, stderr, code, etc } } format.

    // Note: JDoodle doesn't separate stdout and stderr clearly, they are both in `output`.
    const isError = data.statusCode !== 200 || !!data.error;
    if(capture && userId)await evaluationService.recordExecution(sessionId,userId,questionIndex,code,language,isError?"failed":"passed");

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
    logger.error("Code execution unavailable");
    throw new AppError("INTERNAL_ERROR", "Failed to execute code", undefined, 500);
  }
});
