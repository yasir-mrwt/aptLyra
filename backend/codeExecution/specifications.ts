export type ExecutionTestId="binary-search-v1"|"first-repeated-v1";
export type ExecutionCaseResult={id:string;passed:boolean;expected:number|null;actual?:unknown;error?:string};
export type ExecutionTestResult={passed:boolean;cases:ExecutionCaseResult[];error?:string};

const marker="__APTLYRA_TEST_RESULTS__";
// SHA-256 of the exact trusted seed prompt. Ingestion stores question identity as a
// generated family key, so executable eligibility must use the immutable content hash.
export const BINARY_SEARCH_TEST_CONTENT_HASH="ac0eecf2e0c1622ad065077248fe0c03edd68acaa72a5d5facdcef0e030daf7f";

export const FIRST_REPEATED_TEST_CONTENT_HASH="eec634c6c2c0e466d80cb73d2da7c5b25d4dc1c04ce4e24be0804202f087c720";

export function executionTestFor(inventoryClass:string,contentHash:string,category:string,language:string):ExecutionTestId|null {
  if(inventoryClass!=="TRUSTED_BASELINE"||category!=="coding"||!["javascript","python"].includes(language))return null;
  if(contentHash===BINARY_SEARCH_TEST_CONTENT_HASH)return "binary-search-v1";
  return contentHash===FIRST_REPEATED_TEST_CONTENT_HASH?"first-repeated-v1":null;
}

export function canonicalCodeLanguage(value:string):string {
  const normalized=value.trim().toLowerCase();
  if(["js","node","nodejs"].includes(normalized))return "javascript";
  if(["py","python3"].includes(normalized))return "python";
  return normalized;
}

export function withBinarySearchTests(code:string,language:string):string {
  if(language==="javascript")return `${code}\n;(()=>{\n  const cases=[\n    {id:"match",input:[[1,3,5,7,9],7],expected:3},\n    {id:"missing",input:[[1,3,5,7,9],2],expected:-1},\n    {id:"empty",input:[[],3],expected:-1}\n  ];\n  try { const results=cases.map(test=>{const actual=binarySearch(...test.input);return {id:test.id,expected:test.expected,actual,passed:actual===test.expected};});\n    console.log("${marker}"+JSON.stringify({cases:results}));\n  } catch(error) { console.log("${marker}"+JSON.stringify({error:String(error),cases:cases.map(test=>({id:test.id,expected:test.expected,passed:false}))})); }\n})();`;
  if(language==="python")return `${code}\n\nimport json as __aptlyra_json\ntry:\n    __aptlyra_cases = [\n        {"id": "match", "input": ([1, 3, 5, 7, 9], 7), "expected": 3},\n        {"id": "missing", "input": ([1, 3, 5, 7, 9], 2), "expected": -1},\n        {"id": "empty", "input": ([], 3), "expected": -1},\n    ]\n    __aptlyra_results = []\n    for __test in __aptlyra_cases:\n        __actual = binary_search(*__test["input"])\n        __aptlyra_results.append({"id": __test["id"], "expected": __test["expected"], "actual": __actual, "passed": __actual == __test["expected"]})\n    print("${marker}" + __aptlyra_json.dumps({"cases": __aptlyra_results}))\nexcept Exception as __error:\n    print("${marker}" + __aptlyra_json.dumps({"error": str(__error), "cases": [{"id": test["id"], "expected": test["expected"], "passed": False} for test in __aptlyra_cases]}))`;
  throw new Error("Unsupported binary-search test language");
}

export function parseBinarySearchResults(output:string,testId:ExecutionTestId="binary-search-v1"):{userOutput:string;result:ExecutionTestResult|null} {
  const index=output.lastIndexOf(marker);
  if(index<0)return {userOutput:output,result:null};
  const raw=output.slice(index+marker.length).trim().split(/\r?\n/,1)[0];
  try {
    const parsed=JSON.parse(raw) as {cases?:ExecutionCaseResult[];error?:string};
    if(!Array.isArray(parsed.cases)||parsed.cases.length!==(testId==="binary-search-v1"?3:5)||parsed.cases.some(item=>
      typeof item.id!=="string"||typeof item.passed!=="boolean"||(item.expected!==null&&typeof item.expected!=="number")))return {userOutput:output.slice(0,index).trim(),result:null};
    const runtimeError=parsed.error||parsed.cases.find(item=>item.error)?.error;
    return {userOutput:output.slice(0,index).trim(),result:{passed:!runtimeError&&parsed.cases.every(item=>item.passed),cases:parsed.cases,...(runtimeError?{error:String(runtimeError).slice(0,1000)}:{})}};
  } catch { return {userOutput:output.slice(0,index).trim(),result:null}; }
}

export function withExecutionTests(code:string,language:string,testId:ExecutionTestId):string {
  if(testId==="binary-search-v1")return withBinarySearchTests(code,language);
  const cases=[{id:"encounter-order",input:[[4,2,2,4]],expected:2},{id:"unique",input:[[1,2,3]],expected:null},
    {id:"empty",input:[[]],expected:null},{id:"zero",input:[[0,1,0]],expected:0},{id:"negative",input:[[-2,3,-2,3]],expected:-2}];
  if(language==="javascript")return `${code}\n;(()=>{const cases=${JSON.stringify(cases)};const results=cases.map(test=>{try{const actual=firstRepeated(...test.input);return {id:test.id,expected:test.expected,actual:actual==null?null:actual,passed:test.expected===null?actual==null:actual===test.expected};}catch(error){return {id:test.id,expected:test.expected,passed:false,error:String(error)};}});console.log("${marker}"+JSON.stringify({cases:results}));})();`;
  if(language==="python")return `${code}\nimport json as __aptlyra_json\n__aptlyra_cases=__aptlyra_json.loads('${JSON.stringify(cases)}')\n__aptlyra_results=[]\nfor __test in __aptlyra_cases:\n    try:\n        __actual=first_repeated(*__test["input"])\n        __aptlyra_results.append({"id":__test["id"],"expected":__test["expected"],"actual":__actual,"passed":__actual==__test["expected"]})\n    except Exception as __error:\n        __aptlyra_results.append({"id":__test["id"],"expected":__test["expected"],"passed":False,"error":str(__error)})\nprint("${marker}"+__aptlyra_json.dumps({"cases":__aptlyra_results}))`;
  throw new Error("Unsupported execution language");
}

/** Multipart text fields use CRLF; normalize only evidence identity, never stored or executed code. */
export const normalizedExecutionCode=(code:string)=>code.replace(/\r\n/g,"\n");
