import { Response } from "express";
import asyncHandler from "express-async-handler";
import { AppError } from "../types/errors.js";
import logger from "../utils/logger.js";
import { AuthenticatedRequest } from "../types/express.js";
import {sessionRepository} from "../models/Session.js";
import {evaluationService} from "../evaluation/service.js";
import {query} from "../config/db.js";
import {canonicalCodeLanguage,executionTestFor,parseBinarySearchResults,withBinarySearchTests} from "../codeExecution/specifications.js";

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
  if (typeof language!=="string" || typeof code!=="string" || !language || !code || code.length>50000 || (stdin!==undefined && (typeof stdin!=="string" || stdin.length>10000))) {
    throw new AppError("VALIDATION_ERROR", "Language and code are required", undefined, 400);
  }
  const normalizedLanguage=canonicalCodeLanguage(language);
  let capture=false;
  let testId:string|null=null;
  let submittedCode=code;
  if(sessionId!==undefined){
    if(typeof sessionId!=="string" || !/^[0-9a-f-]{36}$/i.test(sessionId) || !Number.isInteger(questionIndex) || questionIndex<0)throw new AppError("VALIDATION_ERROR","Invalid session question",undefined,400);
    const session=userId?await sessionRepository.findByIdForUser(sessionId,userId):null;
    if(!session)throw new AppError("VALIDATION_ERROR","Session not found",undefined,404);
    const q=session.questions[questionIndex];
    if(session.status!=="in-progress" || !q || q.questionType!=="coding" || q.isSubmitted)throw new AppError("VALIDATION_ERROR","Question is not available for execution",undefined,409);
    if(!session.planId||!q.planItemId||!q.questionVersionId)throw new AppError("VALIDATION_ERROR","A pinned interview question is required for test execution",undefined,409);
    if(!["javascript","python"].includes(normalizedLanguage))throw new AppError("VALIDATION_ERROR","Choose JavaScript or Python",undefined,400);
    const pinned=(await query(`SELECT ready.inventory_class,e.content_hash,e.category FROM plan_items i
      JOIN retrieval_entities e ON e.entity_id=i.question_version_id AND e.purpose='question-selection'
      JOIN content_question_readiness ready ON ready.question_version_id=e.entity_id
      WHERE i.id=$1 AND i.plan_id=$2 AND i.session_id=$3 AND i.user_id=$4 AND i.question_version_id=$5`,
    [q.planItemId,session.planId,sessionId,userId,q.questionVersionId])).rows[0];
    if(!pinned)throw new AppError("VALIDATION_ERROR","The selected question version is no longer available",undefined,409);
    testId=executionTestFor(pinned.inventory_class,pinned.content_hash,pinned.category,normalizedLanguage);
    if(!testId)throw new AppError("VALIDATION_ERROR","Run is unavailable because this question has no approved deterministic test definition. You can still submit your answer.",undefined,409);
    submittedCode=withBinarySearchTests(code,normalizedLanguage);
    if(stdin?.trim())throw new AppError("VALIDATION_ERROR","This question uses fixed test cases and does not accept custom input",undefined,400);
    capture=true;
  }
  const jdoodleLanguage = languageMap[normalizedLanguage];

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
        script: submittedCode,
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
    let tests:ReturnType<typeof parseBinarySearchResults>["result"] = null;
    let testOutput="";
    if(testId){const parsed=parseBinarySearchResults(String(data.output||""));tests=parsed.result;testOutput=parsed.userOutput;}
    const passed=Boolean(!isError&&(!testId||tests?.passed));
    if(capture && userId)await evaluationService.recordExecution(sessionId,userId,questionIndex,code,normalizedLanguage,passed?"passed":"failed",
      testId?`Deterministic ${testId} tests ${tests?.cases.filter(item=>item.passed).length??0}/3 passed.`:undefined);

    res.json({
      run: {
        stdout: testId?(testOutput?`${testOutput}\n`:"")+`Tests passed: ${tests?.cases.filter(item=>item.passed).length??0}/3`:(isError ? "" : data.output),
        stderr: testId&&!passed?(isError?data.output:`Tests passed: ${tests?.cases.filter(item=>item.passed).length??0}/3. Check the ${normalizedLanguage==="python"?"binary_search":"binarySearch"} implementation and exact function name.`):(isError ? data.output : ""),
        code: passed ? 0 : 1,
        signal: null,
        cpuTime: data.cpuTime,
        memory: data.memory,
      },
      ...(testId?{tests}:{}),
    });
  } catch (error: any) {
    logger.error("Code execution unavailable");
    throw new AppError("INTERNAL_ERROR", "Failed to execute code", undefined, 500);
  }
});
